import type { CashMovement,HotelData,HotelTables } from '@/lib/hotel-types';
import { z } from 'zod';
import { exactMoney } from '@/modules/shared/validation';

export const receiptFields={
 currency:z.enum(['ARS','USD']).default('ARS'),
 usdAmount:exactMoney.refine(v=>v<=1000000,'El importe máximo es USD 1.000.000.').optional(),
 exchangeRate:z.coerce.number().finite().positive().max(1000000).refine(v=>Math.abs(v*10000-Math.round(v*10000))<0.00001,'Usá hasta cuatro decimales para la cotización.').optional(),
 confirmChange:z.preprocess(v=>v===true||v==='true'||v==='on',z.boolean()).default(false),
};
export type ReceiptInput={currency?:'ARS'|'USD';usdAmount?:number;exchangeRate?:number;confirmChange?:boolean};
// Rate is ARS per USD, stored in units of 1/10000. Round once, to ARS cents.
export function convertedCents(usdCents:number,rate:number){
 if(!Number.isSafeInteger(usdCents)||usdCents<=0||usdCents>100000000||!Number.isSafeInteger(rate)||rate<=0||rate>10000000000)throw Error('Revisá el importe en USD y la cotización.');
 const value=Number((BigInt(usdCents)*BigInt(rate)+BigInt(5000))/BigInt(10000));
 if(!Number.isSafeInteger(value)||value<=0||value>10000000000)throw Error('El equivalente en ARS está fuera del límite permitido.');
 return value;
}
export function receiptAmounts(input:ReceiptInput,applied:number,account:string){
 if(input.currency!=='USD')return null;
 if(account!=='Efectivo')throw Error('Los cobros en USD se registran únicamente en efectivo.');
 if(!Number.isSafeInteger(applied)||applied<=0)throw Error('Indicá el importe en ARS que se aplica al cobro.');
 const usdCents=Math.round((input.usdAmount??0)*100),rate=Math.round((input.exchangeRate??0)*10000),equivalent=convertedCents(usdCents,rate),change=equivalent-applied;
 if(change<0)throw Error('Los dólares recibidos no alcanzan para el importe a cobrar en ARS.');
 if(change>0&&!input.confirmChange)throw Error('Confirmá expresamente el vuelto en ARS antes de guardar.');
 return {usdCents,rate,equivalent,change};
}
export function appendReceipt(add:(sql:string,...values:unknown[])=>void,date:string,input:ReceiptInput,applied:number,account:string,movements:string[],actor:string){
 const amount=receiptAmounts(input,applied,account);if(!amount)return;
 add('INSERT INTO cash_receipts (id,date,movements,usd_cents,rate,change_ars,actor,created) VALUES (?,?,?,?,?,?,?,?)',crypto.randomUUID(),date,JSON.stringify(movements),amount.usdCents,amount.rate,amount.change,actor,new Date().toISOString());
}
export const usd=(cents:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
export const rateLabel=(rate:number)=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:4}).format(rate/10000);
export function receiptForCash(data:Pick<HotelData,'cash_receipts'>,id:string){return (data.cash_receipts??[]).find(r=>(JSON.parse(r.movements) as string[]).includes(id));}
export function cashBalances(cash:CashMovement[],data:Pick<HotelData,'cash_receipts'|'usd_closes'>,date:string){
 const receipts=(data.cash_receipts??[]).filter(r=>r.date<=date),ids=new Set(receipts.flatMap(r=>JSON.parse(r.movements) as string[]));
 return {
  ars:cash.filter(m=>m.account==='Efectivo'&&m.date<=date&&!ids.has(m.id)).reduce((s,m)=>s+m.amount,0)-receipts.reduce((s,r)=>s+r.change_ars,0),
  usd:receipts.reduce((s,r)=>s+r.usd_cents,0)+(data.usd_closes??[]).filter(c=>c.date<=date).reduce((s,c)=>s+c.counted-c.expected,0),
 };
}
export function receiptText(receipt:HotelTables['cash_receipts']){return `${usd(receipt.usd_cents)} recibidos · 1 USD = ARS ${rateLabel(receipt.rate)}${receipt.change_ars?' · vuelto ARS '+(receipt.change_ars/100).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}):' · sin vuelto'}`;}
export function cashExportRows(movements:CashMovement[],data:Pick<HotelData,'cash_receipts'>):(string|number)[][]{
 const seen=new Set<string>();
 return [['Fecha','Cuenta','Actividad','Concepto','Aplicado ARS','Recibo USD','USD recibidos (una vez por recibo)','ARS por USD','Vuelto ARS (una vez por recibo)'],...movements.map(m=>{
  const receipt=receiptForCash(data,m.id),first=receipt&&!seen.has(receipt.id);if(receipt)seen.add(receipt.id);
  return [m.date,m.account,m.area,m.label,m.amount/100,receipt?.id??'',receipt&&first?receipt.usd_cents/100:'',receipt?receipt.rate/10000:'',receipt&&first?receipt.change_ars/100:''];
 })];
}
