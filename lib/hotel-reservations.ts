import { z } from 'zod';
import type { BookingTerms, Rate } from './hotel-types';

export const validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const text=z.string().trim().min(1).max(240);
const note=z.string().trim().max(1000).default('');
export const exactMoney=z.coerce.number().finite().min(0).max(100000000)
 .refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,'Usá como máximo dos decimales.');
const economics={
 priceMode:z.enum(['Tarifa','Acordado','Conservar']).default('Tarifa'),amount:exactMoney.optional(),
 discountType:z.enum(['Ninguno','Importe','Porcentaje']).default('Ninguno'),discountValue:exactMoney.default(0),
 paymentCondition:text.default('Seña y saldo al ingreso'),benefit:z.enum(['Habitual','Descuento','Amigo','Canje','Cortesía']).default('Habitual'),
 reason:note,responsible:z.string().trim().max(240).default(''),observation:note,barterAgreement:note,
 quoteSnapshot:z.string().max(100000).optional(),
};
export const bookingSchema=z.object({
 guest:text,phone:z.string().max(80).default(''),room:z.coerce.number().int(),start:validDate,end:validDate,
 pax:z.coerce.number().int().min(1).max(2),regime:z.enum(['Desayuno','MP','PC']),meal:z.enum(['Cena','Almuerzo']),
 source:text,note,...economics,
});
export const bookingEditSchema=bookingSchema.extend({id:text,version:z.coerce.number().int().nonnegative()});
export const rateSchema=z.object({id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0),type:z.enum(['Single','Doble']),regime:z.enum(['Desayuno','MP','PC']),start:validDate,end:validDate,amount:exactMoney,responsible:text,note});
export const blockSchema=z.object({room:z.coerce.number().int(),start:validDate,end:validDate,reason:text,responsible:text});
export const unblockSchema=z.object({id:text,reason:text,responsible:text});
export const barterSchema=z.object({booking:text,version:z.coerce.number().int().nonnegative(),status:z.enum(['Pendiente','Parcial','Cumplido']),responsible:text,observation:text});

export function reservationNights(start:string,end:string) {
 const dates:string[]=[];
 if(!start||!end||isNaN(Date.parse(start))||isNaN(Date.parse(end)))return dates;
 for(const day=new Date(start+'T00:00:00Z');day<new Date(end+'T00:00:00Z')&&dates.length<=365;day.setUTCDate(day.getUTCDate()+1))dates.push(day.toISOString().slice(0,10));
 return dates;
}
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
export function discountCents(base:number,type:string,value:number,benefit:string) {
 if(benefit==='Cortesía')return base;
 if(type==='Ninguno'){if(value!==0)throw Error('Elegí un tipo de descuento.');return 0;}
 if(type==='Porcentaje'&&value>100)throw Error('El descuento no puede superar el 100%.');
 const result=type==='Importe'?Math.round(value*100):Number((BigInt(base)*BigInt(Math.round(value*100))+BigInt(5000))/BigInt(10000));
 if(result>base)throw Error('El descuento supera el precio base.');
 return result;
}
export function prepareTerms(d:z.infer<typeof bookingSchema>,quote:ReturnType<typeof quoteStay>,previous?:BookingTerms|null) {
 let base:number,snapshot:string,tariff:number|null,mode:string;
 if(d.priceMode==='Conservar'){
  if(!previous)throw Error('No hay un precio anterior para conservar.');
  if(d.discountType!==previous.discount_type||Math.round(d.discountValue*100)!==previous.discount_value||
   (d.benefit==='Cortesía'&&previous.discount_amount!==previous.base_amount))throw Error('Para cambiar el descuento, elegí tarifas o un nuevo precio acordado.');
  base=previous.base_amount;snapshot=previous.snapshot;tariff=previous.tariff_total;mode=previous.price_mode;
 }else{
  if(d.priceMode==='Tarifa'&&quote.total===null)throw Error('Faltan tarifas para algunas noches. Registrá un precio acordado con explicación.');
  if(d.priceMode==='Acordado'&&d.amount===undefined)throw Error('Ingresá el precio acordado antes del descuento.');
  base=d.priceMode==='Tarifa'?quote.total!:Math.round(d.amount!*100);
  snapshot=JSON.stringify(quote.nights);tariff=quote.total;mode=d.priceMode;
 }
 const discount=d.priceMode==='Conservar'?previous!.discount_amount:discountCents(base,d.discountType,d.discountValue,d.benefit);
 if(d.benefit==='Descuento'&&!discount)throw Error('Ingresá el descuento acordado.');
 if(discount&&d.benefit==='Habitual')throw Error('Identificá el beneficio del descuento.');
 const special=d.priceMode==='Acordado'||d.benefit!=='Habitual'||discount>0;
 if(special&&(!d.reason||!d.responsible))throw Error('El precio especial requiere motivo y responsable declarado.');
 if(d.benefit==='Canje'&&!d.barterAgreement)throw Error('Describí qué se acordó en el canje.');
 if(previous?.benefit==='Canje'&&d.benefit!=='Canje')throw Error('Conservá el canje y su historial; una regularización requiere revisión.');
 const sameBarter=previous?.benefit==='Canje'&&previous.barter_agreement===d.barterAgreement;
 const terms={base_amount:base,tariff_total:tariff,discount_amount:discount,
  discount_type:d.benefit==='Cortesía'?'Porcentaje':d.discountType,
  discount_value:d.benefit==='Cortesía'?10000:Math.round(d.discountValue*100),price_mode:mode,snapshot,
  payment_condition:d.paymentCondition,benefit:d.benefit,reason:d.reason,responsible:d.responsible,observation:d.observation,
  barter_agreement:d.benefit==='Canje'?d.barterAgreement:'',barter_status:d.benefit==='Canje'?(sameBarter?previous!.barter_status:'Pendiente'):'No corresponde',
 };
 return {terms,amount:base-discount};
}
