import type { Rate } from '@/lib/hotel-types';
import { reservationNights } from '@/modules/shared/nights';
import { exactMoney,validDate } from '@/modules/shared/validation';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),note=z.string().trim().max(1000).default('');
export const rateSchema=z.object({id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0),type:z.enum(['Single','Doble']),regime:z.enum(['Desayuno','MP','PC']),start:validDate,end:validDate,amount:exactMoney,responsible:text,note});
export function quoteStay(rates:Rate[],type:string,regime:string,start:string,end:string) {
 const nights=reservationNights(start,end).map(date=>{
  const found=rates.filter(r=>r.type===type&&r.regime===regime&&r.start<=date&&date<=r.end);
  if(found.length>1)throw Error('Hay tarifas superpuestas. Revisá su vigencia.');
  const rate=found[0];return {date,type,regime,rate:rate?.id??null,version:rate?.version??null,amount:rate?.amount??null};
 });
 const missing=nights.filter(n=>n.amount===null).map(n=>n.date);
 const total=nights.length&&nights.length<=365&&!missing.length?nights.reduce((s,n)=>s+(n.amount??0),0):null;
 return {nights,missing,total};
}
