import { z } from 'zod';
import { groupCreateSchema,groupMembersSchema,groupSaveSchema } from '@/modules/reservations/groups-domain';
import { newReservationContact } from '@/modules/customers/operations';
import { planReservation } from '@/modules/reservations/operations';
import type { Identity } from '@/modules/access/permissions';
import type { HotelTables } from '@/lib/hotel-types';

type Add=(sql:string,...values:unknown[])=>void;
type Group=HotelTables['reservation_groups'];
export const groupOperations=z.discriminatedUnion('action',[
 z.object({action:z.literal('groupCreate'),data:groupCreateSchema}),
 z.object({action:z.literal('groupSave'),data:groupSaveSchema}),
 z.object({action:z.literal('groupMembers'),data:groupMembersSchema}),
]);
export async function planGroup(db:D1Database,action:string,input:unknown,add:Add,identity:Identity){
 if(!['groupCreate','groupSave','groupMembers'].includes(action))return null;
 const op=groupOperations.parse({action,data:input}),timestamp=new Date().toISOString();
 const id=op.action==='groupCreate'?crypto.randomUUID():op.data.id||crypto.randomUUID();
 const old=op.action!=='groupCreate'&&op.data.id?await db.prepare('SELECT * FROM reservation_groups WHERE id=?').bind(id).first<Group>():null;
 if(op.action!=='groupCreate'&&op.data.id&&(!old||old.version!==op.data.version))throw Error('HOT_VERSION');
 async function link(bookings:string[]){
  if(new Set(bookings).size!==bookings.length)throw Error('Una reserva no puede figurar dos veces.');
  for(const booking of bookings){
   if(!await db.prepare('SELECT id FROM bookings WHERE id=?').bind(booking).first())throw Error('Reserva inexistente.');
   const previous=await db.prepare('SELECT * FROM group_bookings WHERE booking=?').bind(booking).first<HotelTables['group_bookings']>();
   if(previous?.active)throw Error('La reserva ya pertenece a un grupo. Quitala expresamente de ese grupo antes de vincularla.');
   add('INSERT INTO group_bookings (booking,group_id,active) VALUES (?,?,1) ON CONFLICT(booking) DO UPDATE SET group_id=excluded.group_id,active=1',booking,id);
  }
 }
 if(op.action==='groupMembers'){
  const d=op.data;
  add('UPDATE reservation_groups SET version=?,updated=?,updated_by=? WHERE id=?',d.version+1,timestamp,identity.id,id);
  if(d.active)await link(d.bookings);
  else{
   if(new Set(d.bookings).size!==d.bookings.length)throw Error('Hay reservas repetidas.');
   for(const booking of d.bookings){
    if(!await db.prepare('SELECT booking FROM group_bookings WHERE booking=? AND group_id=? AND active=1').bind(booking,id).first())throw Error('La reserva ya no pertenece a este grupo.');
    add('UPDATE group_bookings SET active=0 WHERE booking=? AND group_id=?',booking,id);
   }
  }
  return {before:old,after:{group:id,bookings:d.bookings,active:d.active,reason:d.reason}};
 }
 const d=op.data;
 const contact=await newReservationContact(db,d,add,identity);
 if(old)add('UPDATE reservation_groups SET name=?,customer=?,pax=?,note=?,updated=?,updated_by=?,version=? WHERE id=?',d.name,contact.id,d.pax,d.note,timestamp,identity.id,old.version+1,id);
 else add('INSERT INTO reservation_groups (id,name,customer,pax,note,created,updated,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)',id,d.name,contact.id,d.pax,d.note,timestamp,timestamp,identity.id,identity.id);
 if(op.action==='groupSave'){
  if(!old){if(!op.data.bookings.length)throw Error('Seleccioná al menos una reserva existente.');await link(op.data.bookings);}
  return {before:old,after:{group:id,bookings:old?[]:op.data.bookings}};
 }
 if(new Set(op.data.rooms.map(row=>row.room)).size!==op.data.rooms.length)throw Error('Elegí cada habitación una sola vez.');
 if(op.data.rooms.reduce((sum,row)=>sum+row.pax,0)!==d.pax)throw Error('Las personas distribuidas deben coincidir con la cantidad del grupo.');
 const bookings:string[]=[];
 for(const row of op.data.rooms){
  const change=await planReservation(db,'booking',{...row,responsible:identity.name},add,identity,contact);
  if(!change||!('after' in change)||!change.after)throw Error('No se pudo preparar la reserva del grupo.');
  const booking=change.after.booking;
  bookings.push(booking);
  add('INSERT INTO group_bookings (booking,group_id,active) VALUES (?,?,1)',booking,id);
 }
 return {after:{group:id,bookings}};
}
