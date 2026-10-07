
export function reservationNights(start:string,end:string) {
 const dates:string[]=[];
 if(!start||!end||isNaN(Date.parse(start))||isNaN(Date.parse(end)))return dates;
 for(const day=new Date(start+'T00:00:00Z');day<new Date(end+'T00:00:00Z')&&dates.length<=365;day.setUTCDate(day.getUTCDate()+1))dates.push(day.toISOString().slice(0,10));
 return dates;
}
