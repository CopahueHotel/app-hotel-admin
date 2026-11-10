import { monthDates } from '@/modules/shared/dates';

export type StatisticsScope='realized'|'forecast';
export type StatisticsBooking={id:string;start:string;end:string;pax:number;status:string;regime:string;source:string;group_id:string|null;locality:string|null;province:string|null;country:string|null};
export type StatisticsInput={rooms:{id:number;state:string}[];bookings:StatisticsBooking[];nights:{room:number;date:string;booking:string}[];blocks:{room:number;start:string;end:string}[]};
export type Distribution={label:string;reservations:number;nights:number;share:number};
export const percentage=(value:number,total:number)=>total?value*100/total:null;
const label=(value:string|null)=>value?.trim().replace(/\s+/g,' ')||'Sin información';

// Read-only calculation over the canonical room-night ledger. No prices or cash.
export function hotelStatistics(input:StatisticsInput,month:string,scope:StatisticsScope,today:string){
 const dates=monthDates(month+'-01'),byId=new Map(input.bookings.map(b=>[b.id,b]));
 const eligible=(b:StatisticsBooking,day:string)=>scope==='realized'
  ?day<today&&['Alojado','Finalizada'].includes(b.status)
  :day>=today&&['Confirmada','Alojado'].includes(b.status);
 const included=new Map<string,number>();
 const daily=dates.map(date=>{
  const inScope=scope==='realized'?date<today:date>=today;
  const nights=input.nights.filter(n=>n.date===date),occupied=new Set<number>();
  let guests=0,unreviewed=0;
  for(const night of nights){const b=byId.get(night.booking);if(!b||b.status==='Cancelada')continue;
   if(date<today&&b.status==='Confirmada')unreviewed++;
   if(inScope&&eligible(b,date)){occupied.add(night.room);guests+=b.pax;included.set(b.id,(included.get(b.id)??0)+1);}
  }
  // A current room state has no historical effective date: use it only forward.
  const blocked=new Set(input.blocks.filter(b=>b.start<=date&&date<b.end).map(b=>b.room));
  if(date>=today)for(const room of input.rooms)if(room.state==='Fuera de servicio')blocked.add(room.id);
  const blockedCount=input.rooms.filter(r=>blocked.has(r.id)&&!occupied.has(r.id)).length;
  const capacity=input.rooms.length,available=capacity-blockedCount;
  return {date,inScope,occupied:occupied.size,guests,blocked:blockedCount,capacity,available,occupancy:inScope?percentage(occupied.size,available):null,unreviewed};
 });
 const selected=daily.filter(d=>d.inScope),bookings=input.bookings.filter(b=>included.has(b.id));
 const occupied=selected.reduce((n,d)=>n+d.occupied,0),available=selected.reduce((n,d)=>n+d.available,0),capacity=selected.reduce((n,d)=>n+d.capacity,0);
 const distribution=(key:(b:StatisticsBooking)=>string):Distribution[]=>{
  const groups=new Map<string,Distribution>();
  for(const b of bookings){const name=label(key(b)),normalized=name.toLocaleLowerCase('es-AR');
   const row=groups.get(normalized)??{label:name,reservations:0,nights:0,share:0};
   row.reservations++;row.nights+=included.get(b.id)??0;groups.set(normalized,row);
  }
  return [...groups.values()].map(row=>({...row,share:percentage(row.nights,occupied)??0})).sort((a,b)=>b.nights-a.nights||a.label.localeCompare(b.label,'es'));
 };
 const weekdays=Array.from({length:7},(_,index)=>{
  const weekday=(index+1)%7,days=selected.filter(d=>new Date(d.date+'T12:00:00Z').getUTCDay()===weekday);
  const sold=days.reduce((n,d)=>n+d.occupied,0),offered=days.reduce((n,d)=>n+d.available,0);
  return {label:['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][weekday],days:days.length,nights:sold,available:offered,occupancy:percentage(sold,offered)};
 });
 return {month,scope,today,days:selected.length,rooms:input.rooms.length,capacity,available,blocked:capacity-available,occupied,
  occupancy:percentage(occupied,available),grossOccupancy:percentage(occupied,capacity),reservations:bookings.length,
  people:bookings.reduce((n,b)=>n+b.pax,0),personNights:selected.reduce((n,d)=>n+d.guests,0),
  averageStay:bookings.length?bookings.reduce((n,b)=>n+Math.round((Date.parse(b.end+'T00:00:00Z')-Date.parse(b.start+'T00:00:00Z'))/86400000),0)/bookings.length:null,
  unreviewed:daily.reduce((n,d)=>n+d.unreviewed,0),daily,weekdays,
  bestDays:selected.filter(d=>d.occupied>0).sort((a,b)=>(b.occupancy??0)-(a.occupancy??0)||b.occupied-a.occupied||a.date.localeCompare(b.date)).slice(0,5),
  channels:distribution(b=>b.source),regimes:distribution(b=>b.regime),segments:distribution(b=>b.group_id?'Grupos':'Individuales'),
  countries:distribution(b=>label(b.country)),provinces:distribution(b=>b.province?`${label(b.province)} · ${label(b.country)}`:'Sin información'),
  localities:distribution(b=>b.locality?`${label(b.locality)} · ${label(b.province)} · ${label(b.country)}`:'Sin información')};
}
export type HotelStatistics=ReturnType<typeof hotelStatistics>;
