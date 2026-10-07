import { exactMoney,validDate } from '@/lib/hotel-reservations';
import type { HotelTables } from '@/lib/hotel-types';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),note=z.string().max(2000).default('');
const qty=z.coerce.number().finite().positive().max(100000).refine(v=>Math.abs(v*1000-Math.round(v*1000))<0.000001,'Usá hasta tres decimales.');
const account=z.enum(['Efectivo','Banco','Billetera']),who={responsible:text,observation:note};
export const productRubros=['Bebidas','Alimentos','Limpieza','Amenities','Reutilizables'] as const;
type Add=(sql:string,...values:unknown[])=>void;
export const supplyErrors:Record<string,string>={
 HOT_DISPATCH_INVALID:'Revisá el destino, la condición de cobro, la bebida y su precio.',
 HOT_TABLE_CLOSED:'La cuenta de mesa ya está cerrada. Abrí una nueva para reutilizar la mesa.',
 HOT_TABLE_CHANGED:'Los consumos de la mesa cambiaron. Actualizá y volvé a revisar el cierre.',
 HOT_SETTLE_INVALID:'Revisá la cuenta, la fecha y la estadía para cerrar la mesa. No se puede cobrar dos veces.',
 HOT_RETURN_LIMIT:'La devolución física supera lo despachado o ya devuelto. Revisá la fecha y las unidades.',
 HOT_BEVERAGE_REGULARIZE:'El despacho fue cobrado, transferido o pertenece a un día cerrado. La regularización económica y devolución de dinero siguen pendientes; no se puede corregir aquí.',
 HOT_PURCHASE_INVALID:'Revisá el comprobante, los rubros, las cantidades y los costos.',
 HOT_RECEIPT_LIMIT:'La recepción supera la cantidad pendiente, tiene unidades inválidas o es anterior al comprobante.',
 HOT_HISTORY_IMMUTABLE:'Los movimientos conservan su historial. Registrá una operación vinculada para regularizar.',
};
export function appendBeverageStock(add:Add,sale:string,date:string,product:string,qty:number){
 add("INSERT INTO stock_movements VALUES (?,?,?,?,'Venta / consumo',?)",crypto.randomUUID(),date,product,-qty,sale);
}
export const supplyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('beverageAccount'),data:z.object({table:text,date:validDate,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),...who})}),
z.object({action:z.literal('beverageDispatch'),data:z.object({date:validDate,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),product:text,qty,price:exactMoney,destination:z.enum(['Mesa','Estadía','Cortesía','Interno']),tableAccount:z.string().default(''),booking:z.string().default(''),customer:text,mode:z.enum(['Pendiente','Inmediato','Estadía','Sin cobro']),account,reason:note,...who})}),
z.object({action:z.literal('beverageSettle'),data:z.object({tableAccount:text,date:validDate,method:z.enum(['Cobro','Estadía']),account,booking:z.string().default(''),...who})}),
z.object({action:z.literal('beverageReturn'),data:z.object({dispatch:text,date:validDate,qty,reason:text,...who})}),
z.object({action:z.literal('beverageCorrect'),data:z.object({dispatch:text,date:validDate,reason:text,...who})})]);
export async function planSupply(db:D1Database,action:string,input:unknown,add:Add){
 if(!supplyOperations.options.some(o=>o.shape.action.value===action))return null;
 const op=supplyOperations.parse({action,data:input}),uuid=()=>crypto.randomUUID();
const cash=(date:string,account:string,amount:number,area:string,kind:string,ref:string,label:string)=>{const id=uuid();add('INSERT INTO cash_movements VALUES (?,?,?,?,?,?,?,?)',id,date,account,amount,area,kind,ref,label);return id;};
const sale=(id:string,date:string,booking:string|null,customer:string,label:string,qty:number,amount:number,kind:string,product:string|null,account:string|null)=>add('INSERT INTO sales (id,date,booking,customer,label,qty,amount,kind,product,account) VALUES (?,?,?,?,?,?,?,?,?,?)',id,date,booking,customer,label,qty,amount,kind,product,account);
const activeBooking=async(id:string,date:string)=>{const b=await db.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first<HotelTables['bookings']>();if(!b||!['Confirmada','Alojado'].includes(b.status)||date<b.start||date>b.end)throw Error('Elegí una estadía activa que incluya la fecha del cargo.');return b;};
if(op.action==='beverageAccount'){const d=op.data,id=uuid();add('INSERT INTO beverage_accounts VALUES (?,?,?,?)',id,d.table,d.date+'T'+d.time+':00-03:00',d.responsible);return {after:{id}};}
if(op.action==='beverageDispatch'){
  const d=op.data,p=await db.prepare('SELECT * FROM products WHERE id=?').bind(d.product).first<HotelTables['products']>();if(!p||p.category!=='Bebidas')throw Error('Seleccioná una bebida del catálogo.');
  const free=['Cortesía','Interno'].includes(d.destination);
  if(free&&(d.mode!=='Sin cobro'||!d.reason.trim()))throw Error('Cortesía y consumo interno necesitan motivo y condición sin cobro.');
  if(!free&&(d.mode==='Sin cobro'||d.price<=0))throw Error('La venta necesita un precio positivo y condición de cobro.');
  if(d.destination==='Mesa'&&!d.tableAccount||d.destination!=='Mesa'&&d.tableAccount)throw Error('Seleccioná la cuenta de la mesa.');
  if(d.mode==='Pendiente'&&d.destination!=='Mesa')throw Error('El cobro pendiente necesita una cuenta de mesa.');
  if(d.mode==='Pendiente'&&d.booking)throw Error('La cuenta pendiente se transfiere a la estadía al cerrarla.');
  if(p.unit==='un'&&!Number.isInteger(d.qty))throw Error('La bebida necesita unidades enteras.');
  if(d.destination==='Estadía'&&!d.booking||d.mode==='Estadía'&&!d.booking)throw Error('Seleccioná la estadía.');
  if(d.tableAccount&&!await db.prepare('SELECT id FROM beverage_accounts WHERE id=? AND NOT EXISTS(SELECT 1 FROM beverage_settlements WHERE table_account=?)').bind(d.tableAccount,d.tableAccount).first())throw Error('La cuenta de mesa ya está cerrada o no existe.');
  const b=d.booking?await activeBooking(d.booking,d.date):null;
  const id=uuid(),amount=free?0:Math.round(Math.round(d.price*100)*d.qty);
  if(!free&&amount<=0)throw Error('El importe de venta debe ser mayor a cero.');
  sale(id,d.date,b?.id??null,b?.guest??d.customer,p.name,d.qty,amount,free?d.destination==='Cortesía'?'Cortesía':'Interno':'Bebida',p.id,d.mode==='Inmediato'?d.account:null);
  appendBeverageStock(add,id,d.date,p.id,d.qty);
  add('INSERT INTO beverage_dispatches VALUES (?,?,?,?,?,?,?,?,?)',id,d.time,d.destination,d.tableAccount||null,d.mode,free?0:Math.round(d.price*100),d.reason,d.responsible,d.observation);
  if(d.mode==='Inmediato')cash(d.date,d.account,amount,'Restaurante','Venta',id,p.name);
  return {after:{sale:id}};
 }
if(op.action==='beverageSettle'){
  const d=op.data;
  if(!await db.prepare('SELECT id FROM beverage_accounts WHERE id=? AND NOT EXISTS(SELECT 1 FROM beverage_settlements WHERE table_account=?)').bind(d.tableAccount,d.tableAccount).first())throw Error('La cuenta de mesa ya está cerrada o no existe.');
  const rows=(await db.prepare("SELECT s.* FROM sales s JOIN beverage_dispatches d ON d.sale=s.id WHERE d.table_account=? AND d.mode='Pendiente' AND NOT EXISTS(SELECT 1 FROM beverage_corrections c WHERE c.dispatch=s.id)").bind(d.tableAccount).all<HotelTables['sales']>()).results;
  const b=d.method==='Estadía'?await activeBooking(d.booking,d.date):null;
  // A settlement locks the account inside the same transaction; triggers reject
  // a concurrent dispatch/correction and ensure all current lines are included.
  add('INSERT INTO beverage_settlements VALUES (?,?,?,?,?,?,?)',d.tableAccount,d.date,d.method,d.method==='Cobro'?d.account:null,b?.id??null,d.responsible,d.observation);
  for(const s of rows){if(b){const id=uuid();sale(id,d.date,b.id,b.guest,'Transferencia de mesa · '+s.label,0,s.amount,'Cargo de bebida',null,null);add('INSERT INTO beverage_transfers VALUES (?,?)',s.id,id);}else cash(d.date,d.account,s.amount,'Restaurante','Venta',s.id,'Cuenta de mesa · '+s.label);}
  return {after:{dispatches:rows.map(s=>s.id)}};
 }
if(op.action==='beverageReturn'){const d=op.data,id=uuid();add('INSERT INTO beverage_returns VALUES (?,?,?,?,?,?,?)',id,d.dispatch,d.date,d.qty,d.reason,d.responsible,d.observation);return {after:{id}};}
if(op.action==='beverageCorrect'){
  const d=op.data,s=await db.prepare('SELECT * FROM sales WHERE id=?').bind(d.dispatch).first<HotelTables['sales']>();if(!s)throw Error('Despacho inexistente.');
  const id=uuid();sale(id,d.date,s.booking,s.customer,'Corrección · '+s.label,0,-s.amount,'Corrección bebida',null,null);
  add('INSERT INTO beverage_corrections VALUES (?,?,?,?,?,?)',s.id,id,d.date,d.reason,d.responsible,d.observation);return {before:s,after:{sale:id}};
 }
 return {};
}
