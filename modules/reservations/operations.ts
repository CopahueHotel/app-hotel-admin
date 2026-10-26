import { extraBedPrice,roomCapacity } from '@/modules/reservations/extra-bed';
import { can } from '@/modules/access/permissions';
import type { HotelTables } from '@/lib/hotel-types';
import { appendInitialPayment } from '@/modules/cash/initial-payment';
import { barterSchema,blockSchema,bookingEditSchema,bookingSchema,prepareTerms,quoteStay,rateSchema,reservationNights,unblockSchema } from '@/lib/hotel-reservations';
import type { Booking,BookingTerms,Rate } from '@/lib/hotel-types';
import { planRate } from '@/modules/tariffs/operations';
import { z } from 'zod';
import { reservationCustomer,type PreparedContact } from '@/modules/customers/operations';
import type { Identity } from '@/modules/access/permissions';
import type { RoomSegment } from '@/modules/reservations/room-plan';

export const reservationOperations=z.discriminatedUnion('action',[
 z.object({action:z.literal('booking'),data:bookingSchema}),z.object({action:z.literal('bookingEdit'),data:bookingEditSchema}),
 z.object({action:z.literal('rate'),data:rateSchema}),z.object({action:z.literal('block'),data:blockSchema}),
 z.object({action:z.literal('unblock'),data:unblockSchema}),z.object({action:z.literal('barter'),data:barterSchema}),
]);
const names=reservationOperations.options.map(s=>s.shape.action.value);
type Add=(sql:string,...values:unknown[])=>void;
export async function planReservation(db:D1Database,action:string,input:unknown,add:Add,identity:Identity,contact?:PreparedContact) {
 if(!names.includes(action as typeof names[number]))return null;
 const op=reservationOperations.parse({action,data:input});
 if(op.action==='rate')return planRate(db,op.data,add);
 if(op.action==='block'){
  const d=op.data,dates=reservationNights(d.start,d.end);
  if(!dates.length||dates.length>365)throw Error('El bloqueo necesita entre una y 365 noches.');
  add('INSERT INTO room_blocks (id,room,start,end,reason,responsible) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),d.room,d.start,d.end,d.reason,d.responsible);
  return {};
 }
 if(op.action==='unblock'){
  const old=await db.prepare('SELECT * FROM room_blocks WHERE id=? AND active=1').bind(op.data.id).first();
  if(!old)throw Error('Bloqueo inexistente o ya liberado.');
  add('UPDATE room_blocks SET active=0 WHERE id=?',op.data.id);return {before:old};
 }
 if(op.action==='barter'){
  const old=await db.prepare('SELECT * FROM booking_terms WHERE booking=?').bind(op.data.booking).first<BookingTerms>();
  if(!old||old.benefit!=='Canje')throw Error('La reserva no tiene un canje registrado.');
  add('UPDATE booking_terms SET barter_status=?,version=? WHERE booking=?',op.data.status,op.data.version+1,op.data.booking);
  return {before:old};
 }
 // All remaining actions create or edit a reservation.
 if(op.action!=='booking'&&op.action!=='bookingEdit')return null;
 const bookingData=op.data,dates=reservationNights(bookingData.start,bookingData.end);
 if(!dates.length||dates.length>365)throw Error('La salida debe ser posterior a la llegada, hasta 365 noches.');
 const key=op.action==='bookingEdit'?op.data.id:crypto.randomUUID();
 const old=op.action==='bookingEdit'?await db.prepare('SELECT * FROM bookings WHERE id=?').bind(key).first<Booking>():null;
 const plan=old?await db.prepare('SELECT segments,version FROM booking_room_plans WHERE booking=?').bind(key).first<{segments:string;version:number}>():null;
 const split=!!plan&&JSON.parse(plan.segments).length>1;
 const oldBed=old?await db.prepare('SELECT * FROM booking_extra_beds WHERE booking=?').bind(key).first<HotelTables['booking_extra_beds']>():null;
 if(bookingData.extraBed&&bookingData.removeExtraBed)throw Error('Elegí solicitar o quitar la cama extra.');
 const bed=bookingData.removeExtraBed?null:bookingData.extraBed??(oldBed?{mode:oldBed.mode as 'Noche'|'Total',value:oldBed.value/100,reason:oldBed.reason}:null);
 const bedAmount=bed?extraBedPrice(bed,bookingData.start,bookingData.end):null;
 const bedChanged=!!oldBed!==!!bed||(!!oldBed&&!!bed&&(oldBed.mode!==bed.mode||oldBed.value!==bedAmount!.value||oldBed.total!==bedAmount!.total||oldBed.reason!==bed.reason));
 if(old&&bedChanged&&bookingData.priceMode==='Conservar')throw Error('Para cambiar la cama extra elegí tarifas o un nuevo precio acordado.');
 if((bedChanged||!old&&bed)&&!can(identity,'reservations.price'))throw Error('HOT_FORBIDDEN');
 if(old&&split&&(old.room!==bookingData.room||old.start!==bookingData.start||old.end!==bookingData.end))throw Error('La estadía tiene tramos de habitación. No se pueden reescribir sus fechas o habitación desde la edición general.');
 if(split&&bookingData.priceMode==='Tarifa')throw Error('Para una estadía con tramos conservá el precio guardado o registrá un precio acordado con explicación.');
 if(op.action==='bookingEdit'&&plan){
  const moved=await db.prepare('SELECT id FROM booking_room_moves WHERE booking=? LIMIT 1').bind(key).first();
  if(op.data.roomVersion!==undefined&&op.data.roomVersion!==plan.version||moved&&op.data.roomVersion===undefined)throw Error('HOT_VERSION');
  add('UPDATE booking_room_plans SET version=? WHERE booking=?',plan.version+1,key);
 }
 const room=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(bookingData.room).first<{id:number;type:string;state:string}>();
 if(!room||room.state==='Fuera de servicio'&&!split)throw Error('Habitación no disponible por mantenimiento.');
 if(bookingData.pax>roomCapacity(room.type,!!bed))throw Error(room.type==='Single'?'Una habitación single admite una persona.':'Para tres personas hay que solicitar expresamente una cama extra.');
 if(bed&&room.type==='Single')throw Error('La cama extra se habilita en habitaciones dobles.');
 if(split&&bookingData.pax>1){const segments=JSON.parse(plan!.segments) as RoomSegment[];for(const segment of segments)if(await db.prepare("SELECT id FROM rooms WHERE id=? AND type='Single'").bind(segment.room).first())throw Error('Una habitación single de los tramos admite una persona.');}
 if(op.action==='bookingEdit'&&(!old||!['Confirmada','Alojado'].includes(old.status)))throw Error('Solo se pueden editar reservas confirmadas o en curso.');
 const customer=await reservationCustomer(db,bookingData,add,identity,key,old?.id,contact);
 if(old){bookingData.guest=old.guest;bookingData.phone=old.phone;}
 const stored=old?await db.prepare('SELECT * FROM booking_terms WHERE booking=?').bind(key).first<BookingTerms>():null;
 const previous=stored??(old?{booking:key,base_amount:old.amount,tariff_total:null,discount_amount:0,discount_type:'Ninguno',discount_value:0,price_mode:'Historico',snapshot:'[]',payment_condition:'Sin especificar',benefit:'Habitual',reason:'',responsible:'',observation:'',barter_agreement:'',barter_status:'No corresponde',version:0}:null);
 if(op.action==='bookingEdit'&&previous?.version!==op.data.version)throw Error('HOT_VERSION');
 if(old&&bookingData.priceMode==='Conservar'&&(old.room!==bookingData.room||old.start!==bookingData.start||old.end!==bookingData.end||old.regime!==bookingData.regime))throw Error('Al cambiar habitación, fechas o régimen, elegí tarifas o un nuevo precio acordado.');
 const conflict=await db.prepare('SELECT booking FROM room_nights WHERE room=? AND date>=? AND date<? AND booking<>? LIMIT 1').bind(bookingData.room,bookingData.start,bookingData.end,key).first();
 const blocked=await db.prepare('SELECT id FROM room_blocks WHERE room=? AND active=1 AND start<? AND end>? LIMIT 1').bind(bookingData.room,bookingData.end,bookingData.start).first();
 if(!split&&(conflict||blocked))throw Error('La habitación no está disponible para todas esas noches.');
 const rates=(await db.batch([db.prepare('SELECT * FROM room_rates')]))[0].results as Rate[];
 const quote=quoteStay(rates,room.type,bookingData.regime,bookingData.start,bookingData.end);
 if(bookingData.priceMode==='Tarifa'&&bookingData.quoteSnapshot!==undefined&&bookingData.quoteSnapshot!==JSON.stringify(quote.nights))throw Error('HOT_RATE_CHANGED');
 const priced=prepareTerms(bookingData,quote,previous,bedAmount?.total??0);
 if(bed&&(!oldBed||bedChanged)){
  const now=new Date().toISOString();
  if(oldBed)add('UPDATE booking_extra_beds SET mode=?,value=?,total=?,reason=?,actor=?,updated=?,version=? WHERE booking=?',bed.mode,bedAmount!.value,bedAmount!.total,bed.reason,identity.name,now,oldBed.version+1,key);
  else add('INSERT INTO booking_extra_beds (booking,mode,value,total,reason,actor,created,updated,version) VALUES (?,?,?,?,?,?,?,?,0)',key,bed.mode,bedAmount!.value,bedAmount!.total,bed.reason,identity.name,now,now);
 }
 if(!old)add('INSERT INTO bookings (id,guest,phone,room,start,end,pax,regime,meal,amount,status,source,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',key,bookingData.guest,bookingData.phone,bookingData.room,bookingData.start,bookingData.end,bookingData.pax,bookingData.regime,bookingData.meal,priced.amount,'Confirmada',bookingData.source,bookingData.note);
 customer.finish();
 const version=op.action==='bookingEdit'?op.data.version+1:0;
 const columns=['booking',...Object.keys(priced.terms),'version'];
 add(`INSERT INTO booking_terms (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')}) ON CONFLICT(booking) DO UPDATE SET ${columns.slice(1).map(c=>`${c}=excluded.${c}`).join(',')}`,key,...Object.values(priced.terms),version);
 if(old)add('UPDATE bookings SET guest=?,phone=?,room=?,start=?,end=?,pax=?,regime=?,meal=?,amount=?,source=?,note=? WHERE id=?',bookingData.guest,bookingData.phone,bookingData.room,bookingData.start,bookingData.end,bookingData.pax,bookingData.regime,bookingData.meal,priced.amount,bookingData.source,bookingData.note,key);
 if(oldBed&&!bed)add('DELETE FROM booking_extra_beds WHERE booking=?',key);
 if(bookingData.deposit){if(old)throw Error('Registrá nuevos cobros desde la cuenta de la reserva.');appendInitialPayment(add,key,'Seña · '+bookingData.guest,bookingData.deposit,priced.amount,identity.name);}
 return {before:old?{booking:old,terms:previous,extraBed:oldBed}:undefined,after:{booking:key,customer:customer.id,inquiry:bookingData.inquiryId||null,extraBed:bed?{...bed,...bedAmount}:null,...priced}};
}
