import type { HotelTables, PersonnelTables } from './hotel-types';
export const hotelTimeZone='America/Argentina/Buenos_Aires';
export const staffActions=['staffEmployee','staffEvent','staffAttendance','staffReport'];
export const planningActions=['supplierProfile','deliveryGenerate','deliveryEdit','menuPlan','menuCopy','menuActual',...staffActions];
export const shiftDate=(date:string,days:number)=>{const d=new Date(date+'T00:00:00Z');if(isNaN(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function periodDates(start:string,end:string){const dates:string[]=[];if(!shiftDate(start,0)||!shiftDate(end,0))return dates;for(let d=start;d<=end&&dates.length<367;d=shiftDate(d,1))dates.push(d);return dates;}
export function monthDates(date:string){if(!shiftDate(date,0))return [];const start=date.slice(0,7)+'-01',next=new Date(start+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);return periodDates(start,shiftDate(next.toISOString().slice(0,10),-1));}
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
export function eventConflicts(events:PersonnelTables['staff_events'][],employee:string,start:string,end:string,id=''){
 return events.filter(e=>e.id!==id&&e.employee===employee&&e.status!=='Cancelado'&&e.start<end&&e.end>start);
}
export function eventPeriod(input:{kind:string;startDate:string;endDate:string;startTime:string;endTime:string}){
 return input.kind==='Turno'?{start:input.startDate+'T'+input.startTime,end:input.endDate+'T'+input.endTime}:{start:input.startDate+'T00:00',end:shiftDate(input.endDate,1)+'T00:00'};
}
