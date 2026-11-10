'use client';

import { useEffect,useState } from 'react';
import { useIdentity } from '@/modules/access/context';
import { DataTable } from '@/modules/shared/hotel-ui';
import type { HotelStatistics,Distribution,StatisticsScope } from '@/modules/reports/statistics';

const number=(value:number|null,digits=1)=>value===null?'Sin datos':value.toLocaleString('es-AR',{maximumFractionDigits:digits});
const percent=(value:number|null)=>value===null?'Sin base':number(value)+' %';
function Breakdown({title,rows}:{title:string;rows:Distribution[]}){
 return <section className="panel"><div className="panel-heading"><h2>{title}</h2></div><DataTable heads={['Categoría','Reservas / habitación','Noches','% de noches']} rows={rows.map(row=>[row.label,row.reservations,row.nights,percent(row.share)])}/></section>;
}
export function StatisticsOverview({data}:{data:HotelStatistics}){
 const [geography,setGeography]=useState<'countries'|'provinces'|'localities'>('provinces');
 const offset=(new Date(data.month+'-01T12:00:00Z').getUTCDay()+6)%7;
 return <div className="statistics-content">
  <p className="form-note">{data.scope==='realized'?'Realizada: noches anteriores a hoy con estadía alojada o finalizada.':'Previsión: noches desde hoy de reservas confirmadas o alojadas; todavía no son estadías realizadas.'} Llegada incluida y salida excluida. Cada reserva de habitación se cuenta una sola vez en los desgloses, aunque tenga traslados.</p>
  {!data.days&&<div className="notice">Este mes no tiene días para la vista elegida. Probá cambiar entre Realizada y Previsión.</div>}
  {data.unreviewed>0&&<div className="notice">Hay {data.unreviewed} noches de reservas confirmadas con fecha pasada sin ingreso registrado. No se cuentan como realizadas; revisá sus estados en Reservas.</div>}
  <div className="statistics-kpis">
   <article className="kpi"><span className="kpi-label">Ocupación {data.scope==='realized'?'realizada':'prevista'}</span><strong>{percent(data.occupancy)}</strong><span>Sobre noches disponibles · {data.days} días</span></article>
   <article className="kpi"><span className="kpi-label">Habitaciones-noches</span><strong>{number(data.occupied,0)}</strong><span>{number(data.available,0)} disponibles de {number(data.capacity,0)} totales · {data.blocked} bloqueadas</span></article>
   <article className="kpi"><span className="kpi-label">Reservas por habitación</span><strong>{data.reservations}</strong><span>{data.people} personas en reservas · pueden repetirse entre estadías</span></article>
   <article className="kpi"><span className="kpi-label">Estadía promedio</span><strong>{number(data.averageStay)}<small> noches</small></strong><span>Duración completa de las reservas con noches en este período</span></article>
  </div>
  <div className="statistics-columns">
   <section className="panel"><div className="panel-heading"><div><h2>Ocupación por fecha</h2><p>Porcentaje sobre habitaciones disponibles. Gris: fuera de la vista elegida.</p></div></div><div className="statistics-calendar" aria-label="Calendario de ocupación mensual">
    {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><span className="statistics-weekday" key={d}>{d}</span>)}
    {Array.from({length:offset},(_,i)=><span key={'offset'+i} aria-hidden="true"/>)}
    {data.daily.map(day=><div key={day.date} className={'statistics-day '+(!day.inScope?'outside':day.occupancy===null?'no-capacity':day.occupancy>=80?'high':day.occupancy>=40?'medium':'low')} title={`${day.date} · ${day.inScope?percent(day.occupancy):'Fuera de la vista'} · ${day.occupied} ocupadas / ${day.available} disponibles · ${day.blocked} bloqueadas`}><b>{Number(day.date.slice(8))}</b><span>{day.inScope?percent(day.occupancy):'—'}</span><small>{day.inScope?`${day.occupied}/${day.available}`:''}</small></div>)}
   </div><p className="statistics-note">Cada casillero muestra ocupadas / disponibles. Verde intenso: 80–100 %; intermedio: 40–79 %; claro: menos de 40 %. “Sin base” significa que no hay habitaciones disponibles.</p></section>
   <section className="panel"><div className="panel-heading"><div><h2>Días de la semana</h2><p>Promedios ponderados por noches disponibles.</p></div></div><div className="statistics-weekdays">{data.weekdays.map(day=><div key={day.label}><span>{day.label}</span><div className="statistics-track"><span style={{width:`${day.occupancy??0}%`}}/></div><strong>{percent(day.occupancy)}</strong><small>{day.nights}/{day.available} noches · {day.days} días</small></div>)}</div></section>
  </div>
  <section className="panel"><div className="panel-heading"><div><h2>Fechas de mayor ocupación</h2><p>Ordenadas por porcentaje y luego por habitaciones ocupadas. No es un ranking de ingresos.</p></div></div><DataTable heads={['Fecha','Habitaciones ocupadas','Disponibles','Ocupación']} rows={data.bestDays.map(d=>[new Date(d.date+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}),d.occupied,d.available,percent(d.occupancy)])}/></section>
  <div className="statistics-columns"><Breakdown title="Canales de reserva" rows={data.channels}/><Breakdown title="Grupos e individuales" rows={data.segments}/></div>
  <Breakdown title="Regímenes contratados" rows={data.regimes}/>
  <section className="panel"><div className="panel-heading"><div><h2>Procedencia del contacto</h2><p>Reservas por habitación, no nacionalidad ni procedencia de todos los huéspedes de un grupo.</p></div><label className="field"><span>Agrupar por</span><select className="control" value={geography} onChange={e=>setGeography(e.target.value as typeof geography)}><option value="countries">País</option><option value="provinces">Provincia</option><option value="localities">Localidad</option></select></label></div><DataTable heads={['Procedencia','Reservas / habitación','Noches','% de noches']} rows={data[geography].map(r=>[r.label,r.reservations,r.nights,percent(r.share)])}/><p className="statistics-note">Se usa la ficha actual del contacto; “Sin información” se mantiene en el total. No se deduce ubicación por teléfono ni se replica a los acompañantes.</p></section>
  <details className="panel statistics-method"><summary>Criterios y límites de los datos</summary><p>Ocupación = habitaciones-noches ocupadas / disponibles. Ocupación sobre inventario total: {percent(data.grossOccupancy)}. Capacidad de referencia: {data.rooms} habitaciones actuales. Personas-noches: {data.personNights}.</p><p>Se descuentan los bloqueos por fecha que siguen vigentes. El estado global “Fuera de servicio” se aplica solo a la previsión, porque no tiene fechas históricas. Los bloqueos liberados y las altas históricas de habitaciones no se reconstruyen; las cifras de disponibilidad histórica tienen ese límite.</p><p>Realizada describe lo registrado en la app, sin confirmar asistencia física ni corregir fechas de ingreso o salida. Estadías abiertas con salida vencida requieren revisión. Los meses sin registros no permiten deducir la ocupación anterior a la carga del sistema.</p><p>Las reservas canceladas no suman. Una estadía entre meses aporta a cada mes sus noches correspondientes; el promedio de duración usa la estadía completa. Grupos se cuentan por habitación; un contacto compartido no representa personas únicas. No se calculan ADR, RevPAR, utilidad ni ingresos a partir de cobros.</p></details>
 </div>;
}
export function useStatisticsReport(month:string,scope:StatisticsScope,enabled:boolean){
 const [result,setData]=useState<HotelStatistics|null>(null),[failure,setError]=useState<{url:string;message:string}|null>(null),[attempt,setAttempt]=useState(0),[exporting,setExporting]=useState(false);
 const identity=useIdentity();
 const url=`/api/hotel/statistics?month=${encodeURIComponent(month)}&scope=${scope}`;
 useEffect(()=>{if(!enabled||!month)return;const controller=new AbortController();fetch(url,{signal:controller.signal,cache:'no-store'}).then(async response=>{const body=await response.json() as HotelStatistics & {error?:string};if(!response.ok)throw Error(body.error||'No se pudieron cargar las estadísticas.');return body as HotelStatistics;}).then(body=>{if(!controller.signal.aborted){setData(body);setError(null);}}).catch(error=>{if(!controller.signal.aborted)setError({url,message:error.message});});return()=>controller.abort();},[url,attempt,identity,enabled,month]);
 async function exportStatistics(){setExporting(true);try{const response=await fetch(url+'&export=csv',{cache:'no-store'});if(!response.ok){const body=await response.json() as HotelStatistics & {error?:string};throw Error(body.error||'No se pudo exportar.');}const href=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=href;link.download=`estadisticas-${month}-${scope}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}catch(error){setError({url,message:error instanceof Error?error.message:'No se pudo exportar.'});}finally{setExporting(false);}}
 return {data:result?.month===month&&result.scope===scope?result:null,error:failure?.url===url?failure.message:'',exporting,exportStatistics,refresh:()=>setAttempt(a=>a+1)};
}
