'use client';

import type { Booking,HotelData,RoomBlock } from '@/lib/hotel-types';
import type { EntryForm } from '@/modules/shared/hotel-ui';

import { MaintenancePanel } from '@/components/hotel-reservations';
import { ActionButton as Button } from '@/modules/access/context';
import { fmt,shift } from '@/modules/shared/hotel-ui';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
type Props={data:HotelData;
open:(action:string,initial?:Omit<EntryForm,'action'>)=>void;
setCalendar:Dispatch<SetStateAction<string>>;
calendar:string;
date:string;
rooms:HotelData['rooms'];
blockFor:(room:number,day:string)=>RoomBlock|undefined;
active:Booking[];
setDetail:Dispatch<SetStateAction<string | null>>};
export function CalendarScreen({data,open,setCalendar,calendar,date,rooms,blockFor,active,setDetail}:Props){return <><MaintenancePanel data={data} onCreate={()=>open('block')} onRelease={id=>open('unblock',{id})}/><section className="panel"><div className="calendar-toolbar"><div className="calendar-nav"><Button variant="outline" size="icon" aria-label="Semana anterior" onClick={()=>setCalendar(shift(calendar,-7))}><ChevronLeft size={18}/></Button><h2>{new Date(calendar+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',month:'long',year:'numeric'})}</h2><Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={()=>setCalendar(shift(calendar,7))}><ChevronRight size={18}/></Button><Button variant="outline" onClick={()=>setCalendar(date)}>Ir a la fecha</Button></div><div className="legend"><span><i className="blue"/> Confirmada</span><span><i className="green"/> Alojado</span><span><i className="gray"/> Finalizada</span></div></div><div className="calendar-scroll"><div className="calendar-grid" style={{gridTemplateColumns:'155px repeat(14, minmax(74px,1fr))'}}><div className="calendar-corner">Habitación</div>{Array.from({length:14},(_,i)=>shift(calendar,i)).map(day=><div key={day} className={'calendar-date '+(day===date?'today':'')}><small>{new Date(day+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',weekday:'short'})}</small><b>{day.slice(8)}</b></div>)}{rooms.map((r)=><div className="calendar-row" key={r.id}><button className="room-label" onClick={()=>open('room',r)}><b>{String(r.id).padStart(2,'0')}</b><span>{r.type}<small>{r.state==='Limpia'?'Lista':r.state==='Fuera de servicio'?'Mantenimiento':'Limpieza'}</small></span></button>{Array.from({length:14},(_,i)=>{const day=shift(calendar,i),blocked=blockFor(r.id,day),b=active.find((b)=>b.room===r.id&&b.start<=day&&day<b.end);return <button key={day} className={'calendar-cell '+(day===date?'today':'')+(b?' booked '+(b.status==='Alojado'?'green':b.status==='Finalizada'?'gray':'blue'):'')+((r.state==='Fuera de servicio'||blocked)&&!b?' unavailable':'')} title={b?`${b.guest} · ${b.regime} · ${fmt(b.start)} a ${fmt(b.end)}`:`Habitación ${r.id} · ${fmt(day)} · ${r.state}`} onClick={()=>b?setDetail(b.id):blocked?open('unblock',{id:blocked.id}):r.state==='Fuera de servicio'?open('room',r):open('booking',{room:r.id,start:day,end:shift(day,1)})}>{b&&(i===0||b.start===day)?<span>{b.guest.split(' ')[0]}<small>{b.regime}</small></span>:!b&&(r.state==='Fuera de servicio'||blocked)?<span>Mantenimiento</span>:null}</button>})}</div>)}</div></div><div className="panel-foot">Confirmadas y alojadas bloquean noches. No hay reservas provisionales. Seleccioná una estadía para su ficha o un día libre para reservar. Mantenimiento impide asignar noches.</div></section></>;}
