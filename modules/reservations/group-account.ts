import type { Booking,HotelData } from '@/lib/hotel-types';
import { reservationNights } from '@/modules/shared/nights';
export function groupPricing(mode:string,value:number,rooms:{pax:number;start:string;end:string}[]){
 const weights=rooms.map(r=>r.pax*reservationNights(r.start,r.end).length),units=weights.reduce((a,b)=>a+b,0),cents=Math.round(value*100);
 if(!units||weights.some(w=>!Number.isSafeInteger(w)||w<1)||!Number.isSafeInteger(cents)||cents<=0)throw Error('Revisá personas, noches y precio del grupo.');
 const total=mode==='Persona/noche'?cents*units:cents;
 if(!Number.isSafeInteger(total)||total>10000000000)throw Error('El total del grupo supera el importe permitido.');
 const amounts=weights.map(w=>Number(BigInt(total)*BigInt(w)/BigInt(units)));
 const order=weights.map((w,i)=>({i,remainder:BigInt(total)*BigInt(w)%BigInt(units)})).sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:a.i-b.i);
 for(let left=total-amounts.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)amounts[order[i].i]++;
 return {total,units,amounts};
}
export function groupAccount(data:Pick<HotelData,'bookings'|'group_bookings'|'sales'|'cash_movements'>,id:string){
 const ids=new Set(data.group_bookings.filter(l=>l.group_id===id&&l.active).map(l=>l.booking)),members=data.bookings.filter(b=>ids.has(b.id)&&b.status!=='Cancelada');
 const base=members.reduce((s,b)=>s+b.amount,0),charges=data.sales.filter(s=>s.booking&&ids.has(s.booking)&&s.account===null).reduce((a,s)=>a+s.amount,0);
 const payments=data.cash_movements.filter(m=>m.kind==='Cobro'&&(m.ref===id||ids.has(m.ref))).reduce((s,m)=>s+m.amount,0);
 return {members,base,charges,payments,balance:base+charges-payments};
}
export const groupBalanceSql=(group:string)=>`(SELECT COALESCE(SUM(b.amount),0) FROM bookings b JOIN group_bookings g ON g.booking=b.id WHERE g.group_id=${group} AND g.active=1 AND b.status<>'Cancelada')+(SELECT COALESCE(SUM(s.amount),0) FROM sales s JOIN group_bookings g ON g.booking=s.booking WHERE g.group_id=${group} AND g.active=1 AND s.account IS NULL)-(SELECT COALESCE(SUM(c.amount),0) FROM cash_movements c WHERE c.kind='Cobro' AND (c.ref=${group} OR c.ref IN (SELECT booking FROM group_bookings WHERE group_id=${group} AND active=1)))`;
export async function readGroupBalance(db:D1Database,id:string){return (await db.prepare(`SELECT ${groupBalanceSql('?1')} balance`).bind(id).first<{balance:number}>())?.balance??0;}
export function receivableBalances(data:HotelData,bookings:Booking[],balance:(b:Booking)=>number){
 const seen=new Set<string>();return bookings.flatMap(b=>{const link=data.group_bookings.find(l=>l.booking===b.id&&l.active);if(!link)return [balance(b)];if(seen.has(link.group_id))return [];seen.add(link.group_id);return [groupAccount(data,link.group_id).balance];});
}
