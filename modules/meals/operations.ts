import { reservationNights,validDate } from '@/lib/hotel-reservations';
import type { Booking,HotelTables } from '@/lib/hotel-types';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),note=z.string().max(2000).default('');
const service=z.enum(['Desayuno','Almuerzo','Cena']);
const who={responsible:text,observation:note};
const people=z.array(text).min(1).max(2).refine(ids=>new Set(ids).size===ids.length,'Personas repetidas');
export const mealOperations=z.discriminatedUnion('action',[
 z.object({action:z.literal('guestProfile'),data:z.object({guest:text,version:z.coerce.number().int().nonnegative(),name:note,restrictions:note,preferences:note,...who})}),
 z.object({action:z.literal('mealSuspend'),data:z.object({booking:text,guests:people,start:validDate,end:validDate,service,active:z.boolean(),reason:text,...who})}),
 z.object({action:z.literal('mealServe'),data:z.object({booking:text,guests:people,date:validDate,service,...who})}),
 z.object({action:z.literal('mealPlan'),data:z.object({guest:z.string().default(''),customer:text,date:validDate,service,qty:z.coerce.number().int().min(1).max(500),...who})}),
 z.object({action:z.literal('mealPlanStatus'),data:z.object({id:text,version:z.coerce.number().int().nonnegative(),status:z.enum(['Servido','Cancelada']),...who})}),
]);
type Add=(sql:string,...values:unknown[])=>void;
export async function planMeals(db:D1Database,action:string,input:unknown,add:Add){
 if(!mealOperations.options.some(s=>s.shape.action.value===action))return null;
 const op=mealOperations.parse({action,data:input});
 if(op.action==='guestProfile'){
  const d=op.data,old=await db.prepare('SELECT * FROM booking_guests WHERE id=?').bind(d.guest).first();
  if(!old)throw Error('Huésped inexistente.');
  add('UPDATE booking_guests SET name=?,restrictions=?,preferences=?,observation=?,version=? WHERE id=?',d.name,d.restrictions,d.preferences,d.observation,d.version+1,d.guest);return {before:old};
 }
 if(op.action==='mealPlan'){
  const d=op.data;add('INSERT INTO meal_plans (id,guest,customer,date,service,qty,observation,responsible) VALUES (?,?,?,?,?,?,?,?)',crypto.randomUUID(),d.guest||null,d.customer,d.date,d.service,d.qty,d.observation,d.responsible);return {};
 }
 if(op.action==='mealPlanStatus'){
  const d=op.data,old=await db.prepare('SELECT * FROM meal_plans WHERE id=?').bind(d.id).first<HotelTables['meal_plans']>();
  if(!old||old.status!=='Pendiente')throw Error('La previsión ya está cerrada.');
  add('UPDATE meal_plans SET status=?,responsible=?,version=? WHERE id=?',d.status,d.responsible,d.version+1,d.id);return {before:old};
 }
 const d=op.data,b=await db.prepare('SELECT * FROM bookings WHERE id=?').bind(d.booking).first<Booking>();
 if(!b||!['Confirmada','Alojado'].includes(b.status))throw Error('Seleccioná una reserva activa.');
 for(const guest of d.guests){if(!await db.prepare('SELECT id FROM booking_guests WHERE id=? AND booking=? AND position<=?').bind(guest,b.id,b.pax).first())throw Error('La persona no pertenece a la reserva.');}
 if(op.action==='mealSuspend'){
  const d=op.data;
  // Interval dates are inclusive in the attendance form.
  const next=new Date(d.end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const dates=reservationNights(d.start,next.toISOString().slice(0,10));
  if(!dates.length||dates.length>366||d.start<b.start||d.end>b.end)throw Error('Revisá el intervalo dentro de la estadía.');
  const before=[];
  for(const guest of d.guests)for(const date of dates){
   const old=await db.prepare('SELECT * FROM meal_suspensions WHERE guest=? AND date=? AND service=?').bind(guest,date,d.service).first<HotelTables['meal_suspensions']>();
   if(!d.active&&!old)throw Error('No existe una suspensión para reactivar.');
   before.push(old);
   add('INSERT INTO meal_suspensions (guest,date,service,active,reason,observation,responsible,version) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(guest,date,service) DO UPDATE SET active=excluded.active,reason=excluded.reason,observation=excluded.observation,responsible=excluded.responsible,version=excluded.version',guest,date,d.service,d.active?1:0,d.reason,d.observation,d.responsible,old?old.version+1:0);
  }return {before};
 }
 const servedData=op.data;
 const sale=crypto.randomUUID();
 add('INSERT INTO sales (id,date,booking,customer,label,qty,amount,kind,product,account,service) VALUES (?,?,?,?,?,?,0,\'Incluida\',NULL,NULL,?)',sale,servedData.date,b.id,b.guest,servedData.service,servedData.guests.length,servedData.service);
 for(const guest of servedData.guests)add('INSERT INTO meal_services (guest,date,service,sale) VALUES (?,?,?,?)',guest,servedData.date,servedData.service,sale);
 return {after:{sale}};
}
