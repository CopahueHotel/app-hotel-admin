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
import { hotelDate } from '@/lib/hotel-meals';
import { ChevronLeft,ChevronRight,Maximize2,Minimize2 } from 'lucide-react';
import { useEffect,useRef,useState,type Dispatch,type SetStateAction } from 'react';

type Props={data:HotelData;open:(action:string,initial?:Omit<EntryForm,'action'>)=>void;setCalendar:Dispatch<SetStateAction<string>>;calendar:string;date:string;rooms:HotelData['rooms'];blockFor:(room:number,day:string)=>RoomBlock|undefined;active:Booking[];setDetail:Dispatch<SetStateAction<string|null>>;onMove?:(booking:string,room:number)=>void};
export function CalendarScreen({data,open,setCalendar,calendar,date,rooms,blockFor,active,setDetail,onMove}:Props){
 const identity=useIdentity(),[dragged,setDragged]=useState<string|null>(null),suppressClick=useRef(0);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{
  if(!expanded)return;
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false);};
  window.addEventListener('keydown',escape);
  return ()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape);};
 },[expanded]);
 const mayMove=!!onMove&&can(identity,'reservations.edit'),draggedBooking=active.find(booking=>booking.id===dragged);
 const days=Array.from({length:14},(_,index)=>shift(calendar,index));
 return <><section aria-label="Agenda de habitaciones" className={'panel room-calendar'+(expanded?' calendar-expanded':'')}>
  <div className="calendar-toolbar"><div className="calendar-nav"><Button variant="outline" size="icon" aria-label="Semana anterior" onClick={()=>setCalendar(shift(calendar,-7))}><ChevronLeft size={18}/></Button><h2>{new Date(calendar+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',month:'long',year:'numeric'})}</h2><Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={()=>setCalendar(shift(calendar,7))}><ChevronRight size={18}/></Button><Button variant="outline" onClick={()=>setCalendar(hotelDate())}>Hoy</Button><Button variant="outline" onClick={()=>setCalendar(date)}>Ir a la fecha</Button></div><div className="calendar-tools"><div className="legend"><span><i className="blue"/> Confirmada</span><span><i className="green"/> Alojado</span><span><i className="gray"/> Finalizada</span></div><Button variant="outline" aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>} {expanded?'Reducir calendario':'Ampliar calendario'}</Button></div></div>
  <div className="calendar-scroll" tabIndex={0} aria-label="Disponibilidad de los próximos 14 días"><div className="calendar-grid"><div className="calendar-corner">Habitación</div>{days.map(day=><div key={day} className={'calendar-date '+(day===hotelDate()?'today':'')}><small>{new Date(day+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',weekday:'short'})}</small><b>{day.slice(8)}</b></div>)}
   {rooms.map(room=><div className="calendar-row" key={room.id}><button className="room-label" title={`Habitación ${room.id} · ${room.type} · ${room.state}`} onClick={()=>open('room',room)}><b>{String(room.id).padStart(2,'0')}</b><span>{room.type}</span><small>{room.state==='Limpia'?'Lista':room.state==='Fuera de servicio'?'Manten.':'Limpieza'}</small></button>
    {days.map((day,index)=>{
     const blocked=blockFor(room.id,day),booking=active.find(item=>item.start<=day&&day<item.end&&roomAtDate(data,item,day)===room.id);
     const segment=booking?roomSegments(data,booking).find(item=>item.start<=day&&day<item.end):undefined;
     // A visible room segment is one bar; uncovered nights remain individual buttons.
     if(booking&&index>0&&segment&&segment.start<day)return null;
     const span=booking&&segment?days.filter(value=>value>=day&&value<segment.end).length:1;
     const draggable=mayMove&&booking?.status==='Confirmada'&&roomSegments(data,booking).length===1;
     const dropFree=draggedBooking&&!roomUnavailable(data,room.id,draggedBooking.start,draggedBooking.end,draggedBooking.id)&&draggedBooking.pax<=roomCapacity(room.type,!!bedForBooking(data,draggedBooking.id))&&!(room.type==='Single'&&bedForBooking(data,draggedBooking.id));
     const group=booking?groupForBooking(data,booking.id):undefined;
     return <button key={day} style={{gridColumn:`${index+2} / span ${span}`}} draggable={draggable} className={'calendar-cell '+(day===hotelDate()?'today':'')+(booking?' booked '+(booking.status==='Alojado'?'green':booking.status==='Finalizada'?'gray':'blue'):'')+((room.state==='Fuera de servicio'||blocked)&&!booking?' unavailable':'')+(draggedBooking?(dropFree?' drop-available':' drop-unavailable'):'')}
      title={booking?`${group?'Grupo: '+group.name+' · ':''}${booking.guest} · ${booking.status} · ${booking.regime}${bedForBooking(data,booking.id)?' · cama extra':''} · Hab. ${room.id} · ${fmt(segment?.start??booking.start)} a ${fmt(segment?.end??booking.end)}${draggable?' · Arrastrar para cambiar habitación sin cambiar fechas':''}`:`Habitación ${room.id} · ${fmt(day)} · ${blocked?'Mantenimiento: '+blocked.reason:room.state}`}
      onClick={()=>{if(performance.now()<suppressClick.current)return;return booking?setDetail(booking.id):blocked?open('unblock',{id:blocked.id}):room.state==='Fuera de servicio'?open('room',room):open('booking',{room:room.id,start:day,end:shift(day,1)});}}
      onDragStart={event=>{if(!draggable||!booking){event.preventDefault();return;}event.dataTransfer.setData('application/x-hotel-booking',booking.id);event.dataTransfer.effectAllowed='move';setDragged(booking.id);}}
      onDragEnd={()=>{setDragged(null);suppressClick.current=performance.now()+300;}}
      onDragOver={event=>{if(mayMove&&draggedBooking){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
      onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData('application/x-hotel-booking'),source=active.find(item=>item.id===id);setDragged(null);suppressClick.current=performance.now()+300;if(mayMove&&source?.status==='Confirmada'&&roomSegments(data,source).length===1&&roomAtDate(data,source,source.start)!==room.id)onMove?.(source.id,room.id);}}
     >{booking?<span>{group?.name??booking.guest}<span className="sr-only"> · {booking.status} · {booking.regime}{bedForBooking(data,booking.id)&&' · cama extra'}</span></span>:room.state==='Fuera de servicio'||blocked?<span aria-label="Mantenimiento">Mant.</span>:<span className="sr-only">Habitación {room.id} libre · {fmt(day)}</span>}</button>;
    })}
   </div>)}
  </div></div>
  <div className="panel-foot">Confirmadas y alojadas bloquean sus noches por tramo. Podés arrastrar reservas confirmadas entre habitaciones: las fechas se conservan y siempre se pide confirmación. Para estadías en curso o desde el celular, abrí la ficha y usá Cambiar habitación. Mantenimiento impide asignar noches.</div>
 </section><div className="calendar-maintenance"><div className="calendar-maintenance-actions"><Button variant="outline" permission="rooms.create" onClick={()=>open('block')}>Bloquear habitación</Button></div><details><summary>Ver bloqueos por mantenimiento ({data.room_blocks.filter(block=>block.active).length} activos)</summary><MaintenancePanel data={data} onCreate={()=>open('block')} onRelease={id=>open('unblock',{id})}/></details></div></>;
}
