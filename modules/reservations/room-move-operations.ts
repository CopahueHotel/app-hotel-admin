import { roomCapacity } from '@/modules/reservations/extra-bed';
import { z } from 'zod';
import { validDate } from '@/modules/shared/validation';
import { hotelDate } from '@/modules/meals/domain';
import { roomAtDate,type RoomSegment } from '@/modules/reservations/room-plan';
import type { Booking,HotelTables } from '@/lib/hotel-types';
import type { Identity } from '@/modules/access/permissions';

const text=z.string().trim().min(1).max(1000);
export const roomMoveSchema=z.object({id:z.string().min(1),room:z.coerce.number().int(),version:z.coerce.number().int().nonnegative(),mode:z.enum(['Completa','Traslado']),date:validDate.optional(),reason:text,observation:z.string().trim().max(1000).default('')});
export const roomMoveOperations=z.discriminatedUnion('action',[z.object({action:z.literal('roomMove'),data:roomMoveSchema})]);
type Add=(sql:string,...values:unknown[])=>void;
export async function planRoomMove(db:D1Database,action:string,input:unknown,add:Add,identity:Identity){
 if(action!=='roomMove')return null;
 const d=roomMoveSchema.parse(input),booking=await db.prepare('SELECT * FROM bookings WHERE id=?').bind(d.id).first<Booking>();
 const plan=await db.prepare('SELECT * FROM booking_room_plans WHERE booking=?').bind(d.id).first<HotelTables['booking_room_plans']>();
 if(!booking||!plan)throw Error('Reserva inexistente.');
 if(plan.version!==d.version)throw Error('HOT_VERSION');
 const segments=JSON.parse(plan.segments) as RoomSegment[],date=d.mode==='Completa'?booking.start:d.date??hotelDate();
 if(d.mode==='Completa'&&(booking.status!=='Confirmada'||segments.length!==1))throw Error('Solo se mueve completa una reserva confirmada sin tramos. Para una estadía en curso usá traslado.');
 if(d.mode==='Traslado'&&(booking.status!=='Alojado'||booking.end<=hotelDate()||date<booking.start||date>=booking.end||date>hotelDate()||date<segments.at(-1)!.start))throw Error('El traslado requiere una estadía alojada en curso y una fecha transcurrida dentro de ella, sin reescribir traslados anteriores.');
 const source=roomAtDate({booking_room_plans:[plan]},booking,date);
 if(source===d.room)throw Error('Elegí una habitación diferente.');
 const target=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(d.room).first<{type:string;state:string}>();
 if(!target||target.state==='Fuera de servicio')throw Error('La habitación de destino no está disponible por mantenimiento.');
 const bed=await db.prepare('SELECT booking FROM booking_extra_beds WHERE booking=?').bind(booking.id).first();
 if(booking.pax>roomCapacity(target.type,!!bed)||bed&&target.type==='Single')throw Error('La habitación de destino no admite la ocupación y cama extra solicitadas.');
 const occupied=await db.prepare('SELECT booking FROM room_nights WHERE room=? AND date>=? AND date<? AND booking<>? LIMIT 1').bind(d.room,date,booking.end,booking.id).first();
 const blocked=await db.prepare('SELECT id FROM room_blocks WHERE room=? AND active=1 AND start<? AND end>? LIMIT 1').bind(d.room,booking.end,date).first();
 if(occupied||blocked)throw Error('La habitación de destino no está disponible para todas esas noches.');
 const next:RoomSegment[]=d.mode==='Completa'?[]:segments.filter(segment=>segment.start<date).map(segment=>({...segment,end:segment.end<date?segment.end:date}));
 next.push({room:d.room,start:date,end:booking.end});
 add('UPDATE booking_room_plans SET segments=?,version=? WHERE booking=?',JSON.stringify(next),d.version+1,booking.id);
 if(next[0].room!==booking.room)add('UPDATE bookings SET room=? WHERE id=?',next[0].room,booking.id);
 if(d.mode==='Traslado')add("UPDATE rooms SET state='Pendiente de limpieza' WHERE id=? AND state<>'Fuera de servicio'",source);
 add('INSERT INTO booking_room_moves (id,booking,date,from_room,to_room,mode,reason,observation,actor,actor_id,created,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),booking.id,date,source,d.room,d.mode,d.reason,d.observation,identity.name,identity.id,new Date().toISOString(),d.version);
 return {before:{booking:booking.id,segments},after:{booking:booking.id,segments:next},reason:d.reason};
}
