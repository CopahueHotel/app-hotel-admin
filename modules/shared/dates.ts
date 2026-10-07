export const hotelTimeZone='America/Argentina/Buenos_Aires';
export const shiftDate=(date:string,days:number)=>{const d=new Date(date+'T00:00:00Z');if(isNaN(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function periodDates(start:string,end:string){const dates:string[]=[];if(!shiftDate(start,0)||!shiftDate(end,0))return dates;for(let d=start;d<=end&&dates.length<367;d=shiftDate(d,1))dates.push(d);return dates;}
export function monthDates(date:string){if(!shiftDate(date,0))return [];const start=date.slice(0,7)+'-01',next=new Date(start+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);return periodDates(start,shiftDate(next.toISOString().slice(0,10),-1));}
