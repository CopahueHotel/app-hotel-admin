'use client';

import { Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle } from '@/components/ui/sheet';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { ActionButton as Button,useIdentity } from '@/modules/access/context';
import { can } from '@/modules/access/permissions';
import { GuestMeals,MealHistory } from '@/modules/meals/screen';
import { EconomicDetail } from '@/modules/reservations/forms';
import { DataTable,fmt,Status } from '@/modules/shared/hotel-ui';
import { groupForBooking } from '@/modules/reservations/groups-domain';
import { roomAtDate,roomSegments } from '@/modules/reservations/room-plan';
import { regimeLabel } from '@/modules/shared/regimes';
import { departureText } from '@/lib/hotel-meals';
import { hotelTimeZone } from '@/lib/hotel-planning';
import { bookingBalance,currency } from '@/lib/hotel-view';
import type { Booking,BookingTerms,HotelData } from '@/lib/hotel-types';

type DetailProps={booking:Booking;terms?:BookingTerms;data:HotelData;date:string;busy:boolean;
 onMove?:()=>void;
 onEdit:()=>void;onStatus:()=>void;onCancel:()=>void;onPayment:()=>void;onSale:()=>void;onBarter:()=>void;
 onSaveMeals:(action:string,values:unknown)=>Promise<void>};

function ReservationHistory({booking,data}:{booking:Booking;data:HotelData}){
 const labels:Record<string,string>={booking:'Reserva creada',bookingEdit:'Reserva y condiciones modificadas',status:'Estado de la estadía',payment:'Cobro registrado',barter:'Cumplimiento de canje',sale:'Consumo registrado'};
 const events=data.audit_log.flatMap(log=>{
  if(!labels[log.action])return [];
  try{
   const parsed=JSON.parse(log.detail),input=parsed.input??parsed;
   const related=input.booking===booking.id||parsed.after?.booking===booking.id||(['bookingEdit','status'].includes(log.action)&&input.id===booking.id);
   return related?[{...log,status:typeof input.status==='string'?input.status:''}]:[];
  }catch{return [];}
 }).sort((a,b)=>b.created.localeCompare(a.created));
 return <section className="reservation-history"><h3>Cambios de la reserva</h3>{events.length?events.map(event=><div className="history-record" key={event.id}><strong>{labels[event.action]}{event.status?' · '+event.status:''}</strong><p>{new Date(event.created).toLocaleString('es-AR',{timeZone:hotelTimeZone})} · {event.actor}</p></div>):<p className="muted">No hay cambios registrados disponibles para esta reserva.</p>}<p className="muted">Se muestran los registros disponibles según tus permisos. No se reconstruyen responsables históricos.</p></section>;
}

export function ReservationDetail({booking,terms,data,date,busy,onEdit,onStatus,onCancel,onPayment,onSale,onBarter,onSaveMeals,onMove}:DetailProps){
 const identity=useIdentity(),has=(permission:string)=>can(identity,permission);
 const moves=(data.booking_room_moves??[]).filter(move=>move.booking===booking.id).sort((a,b)=>b.created.localeCompare(a.created));
 const financial=has('reservations.balance'),meals=has('meals.view'),history=financial||meals||moves.length>0;
 const closed=['Finalizada','Cancelada'].includes(booking.status),balance=financial?bookingBalance(booking,data.sales,data.cash_movements):0;
 const tabs=['Resumen',...(meals?['Alimentación']:[]),...(financial?['Cuenta']:[]),...(history?['Historial']:[])];
 return <div className="sheet-body reservation-detail">
  <div className="reservation-dates"><div>Llegada<strong>{fmt(booking.start)}</strong></div><div>Salida<strong>{fmt(booking.end)}</strong></div><div>Noches<strong>{Math.round((Date.parse(booking.end)-Date.parse(booking.start))/86400000)}</strong></div></div>
  <p className="departure-notice">{departureText(booking,date)}<small>Fecha de consulta: {fmt(date)} · hora del hotel</small></p>
  {financial&&<div className="balance-card"><span>{balance>0?'Saldo pendiente':'Saldo de la estadía'}</span><strong>{currency(balance)}</strong><small>Alojamiento + cargos a estadía − cobros</small></div>}
  {!closed&&<div className="reservation-primary-actions"><Button disabled={busy} permission="reservations.edit" onClick={onStatus}>{booking.status==='Alojado'?'Finalizar estadía':'Registrar llegada'}</Button><Button variant="outline" disabled={busy||(financial&&balance<=0)} permission="reservations.collect" onClick={onPayment}>Registrar cobro</Button><Button variant="outline" disabled={busy} permission={['restaurant.create','restaurant.charge']} onClick={onSale}>Agregar consumo</Button></div>}
  <Tabs key={booking.id} defaultValue="Resumen"><TabsList aria-label="Secciones de la reserva">{tabs.map(tab=><TabsTrigger key={tab} value={tab}>{tab}</TabsTrigger>)}</TabsList>
   <TabsContent value="Resumen"><section className="room-segments"><h3>Habitaciones de la estadía</h3>{roomSegments(data,booking).map(segment=><p key={segment.start}>Hab. <strong>{segment.room}</strong> · {fmt(segment.start)} → {fmt(segment.end)} (salida excluida)</p>)}{!closed&&onMove&&<Button variant="outline" disabled={busy} permission="reservations.edit" onClick={onMove}>Cambiar habitación</Button>}</section>{groupForBooking(data,booking.id)&&<p className="form-note">Grupo: <strong>{groupForBooking(data,booking.id)!.name}</strong></p>}<dl className="detail-list"><dt>Contacto</dt><dd>{booking.phone||'Sin registrar'}</dd><dt>Origen</dt><dd>{booking.source}</dd><dt>Régimen</dt><dd>{regimeLabel(booking.regime)}{booking.regime==='MP'&&<small>Servicio habitual: {booking.meal}</small>}</dd>{financial&&<><dt>Condición de pago</dt><dd>{terms?.payment_condition||'Sin condición registrada'}</dd><dt>Beneficio</dt><dd><span className="tag gray">{terms?.benefit??'Habitual'}</span></dd></>}<dt>Observaciones</dt><dd className="reservation-observation">{booking.note||'Sin observaciones'}</dd></dl>
    {!closed&&<><div className="status-actions"><Button variant="outline" disabled={busy} permission="reservations.edit" onClick={onEdit}>Editar reserva y condiciones</Button></div>{has('reservations.cancel')&&<section className="reservation-cancel"><h3>Cancelación</h3><p className="muted">Las reservas con cobros o consumos requieren regularización; no se pueden cancelar desde aquí.</p><Button variant="outline" disabled={busy} permission="reservations.cancel" onClick={onCancel}>Cancelar reserva</Button></section>}</>}
   </TabsContent>
   {meals&&<TabsContent value="Alimentación"><GuestMeals key={booking.id} booking={booking} data={data} date={date} onSave={onSaveMeals} showHistory={false}/></TabsContent>}
   {financial&&<TabsContent value="Cuenta"><EconomicDetail booking={booking} terms={terms} data={data} onBarter={onBarter} showBalance={false}/><section className="reservation-account-section"><h3>Consumos</h3><DataTable heads={['Fecha','Detalle','Importe','Tratamiento']} rows={data.sales.filter(s=>s.booking===booking.id).map(s=>[fmt(s.date),s.label,currency(s.amount),s.amount===0?s.kind:s.account?'Pagado en '+s.account:'Cargo a estadía'])}/></section><section className="reservation-account-section"><h3>Cobros realizados</h3><DataTable heads={['Fecha','Cuenta','Importe']} rows={data.cash_movements.filter(m=>m.ref===booking.id&&m.kind==='Cobro').map(m=>[fmt(m.date),m.account,currency(m.amount)])}/></section></TabsContent>}
   {history&&<TabsContent value="Historial">{moves.length>0&&<section className="reservation-history"><h3>Cambios de habitación</h3>{moves.map(move=><div className="history-record" key={move.id}><strong>Habitación {move.from_room} → {move.to_room} · desde {fmt(move.date)}</strong><p>{move.mode==='Completa'?'Reserva completa':'Traslado durante la estadía'} · {move.reason}</p>{move.observation&&<p>{move.observation}</p>}<p>{new Date(move.created).toLocaleString('es-AR',{timeZone:hotelTimeZone})} · {move.actor}</p></div>)}</section>}{financial&&<ReservationHistory booking={booking} data={data}/>} {meals&&<MealHistory data={data} booking={booking.id}/>}</TabsContent>}
  </Tabs>
 </div>;
}

export function ReservationSheet({booking,onClose,...props}:Omit<DetailProps,'booking'> & {booking?:Booking;onClose:()=>void}){
 return <Sheet open={!!booking} onOpenChange={open=>{if(!open)onClose();}}><SheetContent className="booking-sheet reservation-sheet"><SheetHeader><SheetTitle>{booking?.guest??'Ficha de reserva'}</SheetTitle><SheetDescription>{booking&&<>Habitación {roomAtDate(props.data,booking,props.date)} · {regimeLabel(booking.regime)} · {booking.pax} {booking.pax===1?'persona':'personas'}</>}</SheetDescription>{booking&&<Status value={booking.status}/>}</SheetHeader>{booking&&<ReservationDetail {...props} booking={booking}/>}</SheetContent></Sheet>;
}
