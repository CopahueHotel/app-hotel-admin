import type { HotelTables } from '@/lib/hotel-types';
import { periodDates } from '@/modules/shared/dates';
export type Schedule={start:string;end:string;weekdays:number[];interval:number|null;dates:string[]};
export function frequencyLabel(supplier:HotelTables['suppliers']){
 const s=JSON.parse(supplier.schedule) as Schedule;
 if(supplier.frequency==='Semanal')return 'Semanal: '+s.weekdays.map(d=>['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d]).join(', ');
 if(supplier.frequency==='Cada N días')return `Cada ${s.interval} días desde ${s.start}`;
 if(supplier.frequency==='Fechas puntuales')return 'Fechas puntuales: '+s.dates.join(', ');
 return 'Sin frecuencia · A confirmar';
}
export function deliveryDates(supplier:HotelTables['suppliers'],from:string,to:string){
 const schedule=JSON.parse(supplier.schedule) as Schedule;
 return periodDates(from,to).filter(d=>{
  if(schedule.start&&d<schedule.start||schedule.end&&d>schedule.end)return false;
  if(supplier.frequency==='Semanal')return schedule.weekdays.includes(new Date(d+'T00:00:00Z').getUTCDay());
  if(supplier.frequency==='Cada N días'&&schedule.start&&schedule.interval)return Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(schedule.start+'T00:00:00Z'))/86400000)%schedule.interval===0;
  return supplier.frequency==='Fechas puntuales'&&schedule.dates.includes(d);
 });
}
