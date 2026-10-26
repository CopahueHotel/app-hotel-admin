'use client';
import { bedForBooking,roomCapacity } from '@/modules/reservations/extra-bed';

import type { Booking,HotelData,RoomBlock } from '@/lib/hotel-types';
import type { EntryForm } from '@/modules/shared/hotel-ui';
import { MaintenancePanel } from '@/components/hotel-reservations';
import { ActionButton as Button,useIdentity } from '@/modules/access/context';
import { can } from '@/modules/access/permissions';
import { groupForBooking } from '@/modules/reservations/groups-domain';
import { roomAtDate,roomSegments,roomUnavailable } from '@/modules/reservations/room-plan';
import { fmt,shift } from '@/modules/shared/hotel-ui';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import { useRef,useState,type Dispatch,type SetStateAction } from 'react';

type Props={data:HotelData;open:(action:string,initial?:Omit<EntryForm,'action'>)=>void;setCalendar:Dispatch<SetStateAction<string>>;calendar:string;date:string;rooms:HotelData['rooms'];blockFor:(room:number,day:string)=>RoomBlock|undefined;active:Booking[];setDetail:Dispatch<SetStateAction<string|null>>;onMove?:(booking:string,room:number)=>void};
export function CalendarScreen({data,open,setCalendar,calendar,date,rooms,blockFor,active,setDetail,onMove}:Props){
 const identity=useIdentity(),[dragged,setDragged]=useState<string|null>(null),suppressClick=useRef(0);
 const mayMove=!!onMove&&can(identity,'reservations.edit'),draggedBooking=active.find(booking=>booking.id===dragged);
 const days=Array.from({length:14},(_,index)=>shift(calendar,index));
 return <><MaintenancePanel data={data} onCreate={()=>open('block')} onRelease={id=>open('unblock',{id})}/><section className="panel">
  <div className="calendar-toolbar"><div className="calendar-nav"><Button variant="outline" size="icon" aria-label="Semana anterior" onClick={()=>setCalendar(shift(calendar,-7))}><ChevronLeft size={18}/></Button><h2>{new Date(calendar+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',month:'long',year:'numeric'})}</h2><Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={()=>setCalendar(shift(calendar,7))}><ChevronRight size={18}/></Button><Button variant="outline" onClick={()=>setCalendar(date)}>Ir a la fecha</Button></div><div className="legend"><span><i className="blue"/> Confirmada</span><span><i className="green"/> Alojado</span><span><i className="gray"/> Finalizada</span></div></div>
  <div className="calendar-scroll"><div className="calendar-grid" style={{gridTemplateColumns:'155px repeat(14, minmax(74px,1fr))'}}><div className="calendar-corner">Habitación</div>{days.map(day=><div key={day} className={'calendar-date '+(day===date?'today':'')}><small>{new Date(day+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',weekday:'short'})}</small><b>{day.slice(8)}</b></div>)}
   {rooms.map(room=><div className="calendar-row" key={room.id}><button className="room-label" onClick={()=>open('room',room)}><b>{String(room.id).padStart(2,'0')}</b><span>{room.type}<small>{room.state==='Limpia'?'Lista':room.state==='Fuera de servicio'?'Mantenimiento':'Limpieza'}</small></span></button>
    {days.map((day,index)=>{
     const blocked=blockFor(room.id,day),booking=active.find(item=>item.start<=day&&day<item.end&&roomAtDate(data,item,day)===room.id);
     const segment=booking?roomSegments(data,booking).find(item=>item.start<=day&&day<item.end):undefined;
     const draggable=mayMove&&booking?.status==='Confirmada'&&roomSegments(data,booking).length===1;
     const dropFree=draggedBooking&&!roomUnavailable(data,room.id,draggedBooking.start,draggedBooking.end,draggedBooking.id)&&draggedBooking.pax<=roomCapacity(room.type,!!bedForBooking(data,draggedBooking.id))&&!(room.type==='Single'&&bedForBooking(data,draggedBooking.id));
     const group=booking?groupForBooking(data,booking.id):undefined;
     return <button key={day} draggable={draggable} className={'calendar-cell '+(day===date?'today':'')+(booking?' booked '+(booking.status==='Alojado'?'green':booking.status==='Finalizada'?'gray':'blue'):'')+((room.state==='Fuera de servicio'||blocked)&&!booking?' unavailable':'')+(draggedBooking?(dropFree?' drop-available':' drop-unavailable'):'')}
      title={booking?`${group?'Grupo: '+group.name+' · ':''}${booking.guest} · ${booking.regime} · Hab. ${room.id} · ${fmt(segment?.start??booking.start)} a ${fmt(segment?.end??booking.end)}${draggable?' · Arrastrar para cambiar habitación sin cambiar fechas':''}`:`Habitación ${room.id} · ${fmt(day)} · ${room.state}`}
      onClick={()=>{if(performance.now()<suppressClick.current)return;return booking?setDetail(booking.id):blocked?open('unblock',{id:blocked.id}):room.state==='Fuera de servicio'?open('room',room):open('booking',{room:room.id,start:day,end:shift(day,1)});}}
      onDragStart={event=>{if(!draggable||!booking){event.preventDefault();return;}event.dataTransfer.setData('application/x-hotel-booking',booking.id);event.dataTransfer.effectAllowed='move';setDragged(booking.id);}}
      onDragEnd={()=>{setDragged(null);suppressClick.current=performance.now()+300;}}
      onDragOver={event=>{if(mayMove&&draggedBooking){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
      onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData('application/x-hotel-booking'),source=active.find(item=>item.id===id);setDragged(null);suppressClick.current=performance.now()+300;if(mayMove&&source?.status==='Confirmada'&&roomSegments(data,source).length===1&&roomAtDate(data,source,source.start)!==room.id)onMove?.(source.id,room.id);}}
     >{booking&&(index===0||segment?.start===day)?<span>{group?.name??booking.guest.split(' ')[0]}<small>{booking.regime}{bedForBooking(data,booking.id)&&' · cama extra'}</small></span>:!booking&&(room.state==='Fuera de servicio'||blocked)?<span>Mantenimiento</span>:null}</button>;
    })}
   </div>)}
  </div></div>
  <div className="panel-foot">Confirmadas y alojadas bloquean sus noches por tramo. Podés arrastrar reservas confirmadas entre habitaciones: las fechas se conservan y siempre se pide confirmación. Para estadías en curso o desde el celular, abrí la ficha y usá Cambiar habitación. Mantenimiento impide asignar noches.</div>
 </section></>;
}
