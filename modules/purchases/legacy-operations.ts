import { remainingAmount } from '@/modules/shared/money';
import type { OperationContext } from '@/modules/shared/operations';
import { z } from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const str=z.string().trim().min(1).max(240), money=z.coerce.number().finite().min(0).max(100000000), qty=z.coerce.number().finite().positive().max(100000);
const account=z.enum(['Efectivo','Banco','Billetera']),area=z.enum(['Hotel','Restaurante','Compartido']);
const schemas={expense:z.object({date,due:date,supplier:str,label:str,area,category:str,amount:money.refine(v=>v>0),kind:z.enum(['Fijo','Variable']),paid:z.boolean(),account}),
payExpense:z.object({date,id:str,amount:money.refine(v=>v>0),account}),
purchase:z.object({date,due:date,supplier:str,product:str,qty,cost:money.refine(v=>v>0),paid:z.boolean(),account})};
export const legacyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('expense'),data:schemas.expense}),z.object({action:z.literal('payExpense'),data:schemas.payExpense}),z.object({action:z.literal('purchase'),data:schemas.purchase})]);
export async function planLegacy(actionName:string,input:unknown,context:OperationContext){
 if(!legacyOperations.options.some(s=>s.shape.action.value===actionName))return null;
 const {action,data:d}=legacyOperations.parse({action:actionName,data:input});
 const {db,add,row,cash,id,cents}=context;
 if(action==='expense'){const key=id();add('INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?)',key,d.date,d.due,d.supplier,d.label,d.area,d.category,cents(d.amount),d.kind);if(d.paid)cash(d.date,d.account,-cents(d.amount),d.area,'Pago',key,d.label);}
if(action==='payExpense'){const e=await row('expenses','id',d.id);if(!e)throw new Error('Gasto inexistente.');const p=await db.prepare("SELECT COALESCE(-SUM(amount),0) n FROM cash_movements WHERE ref=? AND kind='Pago'").bind(d.id).first<{n:number}>();if(cents(d.amount)>remainingAmount(e.amount,0,p?.n??0))throw new Error('El pago supera lo adeudado.');cash(d.date,d.account,-cents(d.amount),e.area,'Pago',d.id,e.label);}
if(action==='purchase'){const p=await row('products','id',d.product);if(!p)throw new Error('Producto inexistente');const key=id(),ar=p.category==='Bebidas'||p.category==='Alimentos'?'Restaurante':'Compartido';add('INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?)',key,d.date,d.due,d.supplier,'Compra · '+p.name,ar,'Insumos',cents(d.qty*d.cost),'Variable');add('INSERT INTO stock_movements VALUES (?,?,?,?,?,?)',id(),d.date,d.product,d.qty,'Compra',key);if(d.paid)cash(d.date,d.account,-cents(d.qty*d.cost),ar,'Pago',key,'Compra · '+p.name);}

 return {};
}
