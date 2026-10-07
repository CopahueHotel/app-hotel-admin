import { remainingAmount } from '@/modules/shared/money';
import type { OperationContext } from '@/modules/shared/operations';
import { z } from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const str=z.string().trim().min(1).max(240),money=z.coerce.number().finite().min(0).max(100000000);
const account=z.enum(['Efectivo','Banco','Billetera']);
const schemas={payment:z.object({date,booking:str,amount:money.refine(v=>v>0),account}),
close:z.object({date,counted:money,note:z.string().max(1000).default('')}),
transfer:z.object({date,from:account,to:account,amount:money.refine(v=>v>0)}),
movement:z.object({date,account,amount:money.refine(v=>v>0),kind:z.enum(['Aporte de socios','Retiro de socios']),label:str})};
export const legacyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('payment'),data:schemas.payment}),z.object({action:z.literal('close'),data:schemas.close}),z.object({action:z.literal('transfer'),data:schemas.transfer}),z.object({action:z.literal('movement'),data:schemas.movement})]);
export async function planLegacy(actionName:string,input:unknown,context:OperationContext){
 if(!legacyOperations.options.some(s=>s.shape.action.value===actionName))return null;
 const {action,data:d}=legacyOperations.parse({action:actionName,data:input});
 const {db,add,actor,row,cash,id,cents}=context;
 if(action==='payment'){const b=await row('bookings','id',d.booking);if(!b||['Cancelada','Finalizada'].includes(b.status))throw new Error('Seleccioná una estadía activa.');const s=await db.prepare('SELECT COALESCE(SUM(amount),0) n FROM sales WHERE booking=? AND account IS NULL').bind(d.booking).first<{n:number}>();const p=await db.prepare("SELECT COALESCE(SUM(amount),0) n FROM cash_movements WHERE ref=? AND kind='Cobro'").bind(d.booking).first<{n:number}>();if(cents(d.amount)>remainingAmount(b.amount,s?.n??0,p?.n??0))throw new Error('El cobro supera el saldo pendiente.');cash(d.date,d.account,cents(d.amount),'Hotel','Cobro',d.booking,'Cobro · '+b.guest);}
if(action==='close'){
 // SELECT and triggers execute in the same batch transaction as the request and audit.
 add("INSERT INTO daily_closes (date,expected,counted,note,actor,created) SELECT ?,COALESCE(SUM(amount),0),?,?,?,? FROM cash_movements WHERE account='Efectivo' AND date<=?",d.date,cents(d.counted),d.note,actor,new Date().toISOString(),d.date);
}
if(action==='transfer'){if(d.from===d.to)throw new Error('Las cuentas deben ser distintas');const key=id();cash(d.date,d.from,-cents(d.amount),'Compartido','Transferencia',key,'Transferencia a '+d.to);cash(d.date,d.to,cents(d.amount),'Compartido','Transferencia',key,'Transferencia desde '+d.from);}
if(action==='movement')cash(d.date,d.account,cents(d.amount)*(d.kind==='Retiro de socios'?-1:1),'Compartido',d.kind,'',d.label);

 return {};
}
