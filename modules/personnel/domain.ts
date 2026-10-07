import type { PersonnelTables } from '@/lib/hotel-types';
import { shiftDate } from '@/modules/shared/dates';
export function eventConflicts(events:PersonnelTables['staff_events'][],employee:string,start:string,end:string,id=''){
 return events.filter(e=>e.id!==id&&e.employee===employee&&e.status!=='Cancelado'&&e.start<end&&e.end>start);
}
export function eventPeriod(input:{kind:string;startDate:string;endDate:string;startTime:string;endTime:string}){
 return input.kind==='Turno'?{start:input.startDate+'T'+input.startTime,end:input.endDate+'T'+input.endTime}:{start:input.startDate+'T00:00',end:shiftDate(input.endDate,1)+'T00:00'};
}
