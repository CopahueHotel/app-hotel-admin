'use client';
import { useRef,useState,type FormEvent } from 'react';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ActionButton as Button,SessionResponsible } from '@/modules/access/context';
import { roomAtDate,roomSegments,roomUnavailable } from '@/modules/reservations/room-plan';
import { hotelDate } from '@/modules/meals/domain';
import { fmt } from '@/modules/shared/hotel-ui';
import type { Save } from '@/modules/shared/planning-ui';
import type { Booking,HotelData } from '@/lib/hotel-types';

export function RoomMoveDialog({booking,data,target,onSave,onClose}:{booking:Booking;data:HotelData;target?:number;onSave:Save;onClose:()=>void}){
 const [version]=useState(()=>data.booking_room_plans.find(plan=>plan.booking===booking.id)?.version??0),[room,setRoom]=useState(target?String(target):''),[date,setDate]=useState(hotelDate),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const segments=roomSegments(data,booking),whole=booking.status==='Confirmada'&&segments.length===1,effective=whole?booking.start:date;
 const source=roomAtDate(data,booking,effective),destination=data.rooms.find(item=>item.id===Number(room));
 const capacity=destination?.type==='Single'&&booking.pax>1;
 const unavailable=!!destination&&roomUnavailable(data,destination.id,effective,booking.end,booking.id);
 const invalidDate=!whole&&(booking.status!=='Alojado'||booking.end<=hotelDate()||date<segments.at(-1)!.start||date>=booking.end||date>hotelDate());
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(lock.current)return;const values=Object.fromEntries(new FormData(event.currentTarget));lock.current=true;setBusy(true);setError('');try{await onSave('roomMove',{id:booking.id,room:Number(room),version,mode:whole?'Completa':'Traslado',date:effective,reason:values.reason,observation:values.observation});onClose();}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo cambiar la habitación.');}finally{setBusy(false);lock.current=false;}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="entry-dialog"><DialogHeader><DialogTitle>{whole?'Mover reserva de habitación':'Traslado durante la estadía'}</DialogTitle><DialogDescription>{booking.guest} · {whole?'Se conservan llegada y salida.':'Se conservan los tramos anteriores a la fecha del traslado.'}</DialogDescription></DialogHeader><form className="entry-form" onSubmit={submit}><fieldset disabled={busy} className="room-move-fields"><div className="form-grid">
  <p className="form-note">Habitación de origen: <strong>{source}</strong> · {fmt(effective)} → {fmt(booking.end)} (salida excluida).</p>
  {!whole&&<label className="field"><span>Fecha efectiva del traslado · día del hotel</span><Input type="date" value={date} min={segments.at(-1)!.start} max={hotelDate()} onChange={event=>setDate(event.target.value)} required/></label>}
  <label className="field"><span>Habitación de destino</span><select className="control" value={room} onChange={event=>setRoom(event.target.value)} required><option value="">Seleccionar habitación</option>{data.rooms.filter(item=>item.id!==source).map(item=><option key={item.id} value={item.id} disabled={item.state==='Fuera de servicio'||item.type==='Single'&&booking.pax>1}>{item.id} · {item.type}{item.state==='Fuera de servicio'?' · Mantenimiento':roomUnavailable(data,item.id,effective,booking.end,booking.id)?' · Sin disponibilidad':''}</option>)}</select></label>
  <label className="field full-width"><span>Motivo del cambio</span><Input name="reason" required maxLength={1000}/></label><label className="field full-width"><span>Observación (opcional)</span><textarea className="control" name="observation" rows={3} maxLength={1000}/></label>
  <p className="form-note">Se conserva el precio acordado y su detalle, aunque cambie el tipo de habitación. No se generan consumos, cobros ni devoluciones. Una diferencia económica se registra por separado desde Editar reserva y condiciones.</p>
  {!whole&&<p className="form-note">La habitación de origen quedará pendiente de limpieza. La nueva habitación ocupa desde esta fecha hasta la salida; no se administra ocupación por horas.</p>}
  {unavailable&&<p className="notice error full-width" role="alert">La habitación de destino no está disponible para todas esas noches.</p>}{capacity&&<p className="notice error full-width" role="alert">Una habitación single admite una persona; elegí un destino con capacidad para toda la reserva.</p>}{invalidDate&&<p className="notice error full-width" role="alert">Elegí una fecha transcurrida dentro de la estadía alojada, sin reescribir traslados anteriores. Si la salida ya pasó, primero requiere regularización.</p>}
  <SessionResponsible/>
 </div>{error&&<p className="notice error" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="outline" onClick={onClose}>Volver</Button><Button type="submit" permission="reservations.edit" disabled={busy||!room||Number(room)===source||unavailable||capacity||invalidDate}>{busy?'Guardando…':'Confirmar cambio de habitación'}</Button></div></fieldset></form></DialogContent></Dialog>;
}
