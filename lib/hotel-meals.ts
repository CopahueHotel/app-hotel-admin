import type { Booking, HotelData } from './hotel-types';
export const services=['Desayuno','Almuerzo','Cena'] as const;
export type Service=typeof services[number];
export const hotelDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function departureText(b:Booking,date:string){
 if(b.status==='Cancelada')return 'Cancelada';
 if(b.status==='Finalizada')return 'Finalizada';
 const nights=Math.round((Date.parse(b.end+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000);
 return nights<0?'Salida pendiente de registrar':nights===0?'Sale hoy':nights===1?'Sale mañana':`Quedan ${nights} noches`;
}
export function mealIncluded(b:Booking,date:string,service:string,overrides:HotelData['meal_overrides']){
 return b.start<=date&&date<b.end&&(service==='Desayuno'||b.regime==='PC'||b.regime==='MP'&&service===(overrides.find(m=>m.booking===b.id&&m.date===date)?.meal||b.meal));
}
export type KitchenRow={key:string;booking:string|null;guest:string|null;plan:string|null;room:string;name:string;qty:number;regime:string;character:string;restrictions:string;preferences:string;observation:string;reason:string;state:string;expected:number;external:boolean;version:number};
export function kitchenRows(data:HotelData,date:string,service:Service):KitchenRow[]{
 const rows:KitchenRow[]=[];
 for(const b of data.bookings.filter(b=>!['Cancelada','Finalizada'].includes(b.status)&&b.start<=date&&date<=b.end)){
  for(const g of data.booking_guests.filter(g=>g.booking===b.id&&g.position<=b.pax)){
   const included=mealIncluded(b,date,service,data.meal_overrides);
   const plan=data.meal_plans.find(p=>p.guest===g.id&&p.date===date&&p.service===service&&p.status!=='Cancelada');
   // Departure services are deliberately visible, outside the existing included rule.
   const suspended=data.meal_suspensions.find(s=>s.guest===g.id&&s.date===date&&s.service===service&&s.active===1);
   if(!included&&!plan&&!suspended&&date!==b.end)continue;
   const served=data.meal_services.some(s=>s.guest===g.id&&s.date===date&&s.service===service)||plan?.status==='Servido';
   const legacy=data.sales.filter(s=>s.booking===b.id&&s.date===date&&s.kind==='Incluida'&&(s.service===service||s.service===null)&&!data.meal_services.some(m=>m.sale===s.id));
   rows.push({key:g.id,booking:b.id,guest:g.id,plan:plan?.id??null,room:String(b.room),name:g.name||`${b.guest} · Persona ${g.position}`,qty:1,regime:b.regime,character:included?'Incluida':plan?'Adicional':date===b.end?'Salida: revisión pendiente':'No incluida en la elección actual',restrictions:g.restrictions,preferences:g.preferences,observation:[g.observation,plan?.observation,suspended?.observation].filter(Boolean).join(' · '),reason:suspended?.reason??'',state:suspended?'Suspendida':served?'Servido':legacy.length?'Servicio histórico sin atribución individual':included||plan?'Pendiente':'Sin confirmar',expected:suspended?0:included||plan?1:0,external:false,version:plan?.version??0});
  }
 }
 for(const p of data.meal_plans.filter(p=>!p.guest&&p.date===date&&p.service===service&&p.status!=='Cancelada'))rows.push({key:p.id,booking:null,guest:null,plan:p.id,room:'—',name:p.customer,qty:p.qty,regime:'Externo',character:'Adicional',restrictions:'',preferences:'',observation:p.observation,reason:'',state:p.status,expected:p.qty,external:true,version:p.version});
 return rows;
}
export function kitchenTotals(rows:KitchenRow[]){const hotel=rows.filter(r=>!r.external).reduce((n,r)=>n+r.expected,0),external=rows.filter(r=>r.external).reduce((n,r)=>n+r.expected,0);return {hotel,external,total:hotel+external};}
