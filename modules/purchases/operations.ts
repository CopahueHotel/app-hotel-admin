import { exactMoney,validDate } from '@/lib/hotel-reservations';
import type { HotelTables } from '@/lib/hotel-types';
import { z } from 'zod';
import { attachmentFiles,appendAttachments } from '@/modules/purchases/attachments';
import { planPurchaseEdit } from '@/modules/purchases/edit-operations';
import type { Identity } from '@/modules/access/permissions';
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
 HOT_PURCHASE_EDIT:'El cambio afecta pagos, mercadería recibida o un día cerrado. Conservá esos datos; los ajustes posteriores requieren regularización.',
 HOT_ATTACHMENT_INVALID:'Adjuntá un PDF, JPG, PNG o WebP válido, de hasta 1 MB. Máximo 20 archivos por gasto.',
};
export function appendBeverageStock(add:Add,sale:string,date:string,product:string,qty:number){
 add("INSERT INTO stock_movements VALUES (?,?,?,?,'Venta / consumo',?)",crypto.randomUUID(),date,product,-qty,sale);
}
export const purchaseDocumentSchema=z.object({date:validDate,due:z.union([validDate,z.literal('')]).default(''),supplier:text,invoice:note,label:text,area:z.enum(['Hotel','Restaurante','Compartido']),kind:z.enum(['Fijo','Variable']),type:z.enum(['Productos','Servicio','Administrativo']),category:text,amount:exactMoney.default(0),received:z.boolean().default(false),lines:z.array(z.object({id:z.string().default(''),product:text,category:z.enum(productRubros),qty,cost:exactMoney.refine(v=>v>0)})).max(100).default([]),files:attachmentFiles,...who});
export const purchaseEditSchema=purchaseDocumentSchema.extend({expense:text,version:z.coerce.number().int().nonnegative(),reason:text});
export type PurchaseEdit=z.infer<typeof purchaseEditSchema>;
export const supplyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('purchaseDocument'),data:purchaseDocumentSchema}),
z.object({action:z.literal('purchaseEdit'),data:purchaseEditSchema}),
z.object({action:z.literal('purchaseAttach'),data:z.object({expense:text,files:attachmentFiles.refine(files=>files.length>0),...who})}),
z.object({action:z.literal('purchaseReceive'),data:z.object({expense:text,date:validDate,lines:z.array(z.object({line:text,qty})).min(1).max(100).refine(v=>new Set(v.map(l=>l.line)).size===v.length,'Líneas repetidas'),...who})}),
z.object({action:z.literal('supplierPay'),data:z.object({expense:text,date:validDate,amount:exactMoney.refine(v=>v>0),account,reference:note,files:attachmentFiles,...who})})]);
export async function planSupply(db:D1Database,action:string,input:unknown,add:Add,identity?:Identity){
 if(!supplyOperations.options.some(o=>o.shape.action.value===action))return null;
 const op=supplyOperations.parse({action,data:input}),uuid=()=>crypto.randomUUID();
if(op.action==='purchaseEdit'){if(!identity)throw Error('HOT_FORBIDDEN');return planPurchaseEdit(db,op.data,add,identity);}
if(op.action==='purchaseAttach'){if(!identity)throw Error('HOT_FORBIDDEN');if(!await db.prepare('SELECT id FROM expenses WHERE id=?').bind(op.data.expense).first())throw Error('Comprobante inexistente.');return {after:{expense:op.data.expense,files:await appendAttachments(add,op.data.expense,op.data.files,identity)}};}
const cash=(date:string,account:string,amount:number,area:string,kind:string,ref:string,label:string)=>{const id=uuid();add('INSERT INTO cash_movements VALUES (?,?,?,?,?,?,?,?)',id,date,account,amount,area,kind,ref,label);return id;};


if(op.action==='purchaseDocument'){
  const d=op.data,id=uuid();
  if(d.type==='Productos'&&!d.lines.length||d.type!=='Productos'&&(d.lines.length||d.received))throw Error('Revisá el tipo de comprobante y las líneas de productos.');
  const lines=[];
  for(const l of d.lines){const p=await db.prepare('SELECT * FROM products WHERE id=?').bind(l.product).first<HotelTables['products']>();if(!p)throw Error('Producto inexistente.');if(p.unit==='un'&&!Number.isInteger(l.qty))throw Error('Los productos controlados por unidad necesitan cantidades enteras.');const compatible=p.category===l.category||p.category==='Limpieza y amenities'&&['Limpieza','Amenities'].includes(l.category);if(!compatible)throw Error('El rubro debe corresponder a la categoría del producto.');lines.push({...l,id:uuid(),cost:Math.round(l.cost*100),amount:Math.round(l.qty*Math.round(l.cost*100))});}
  const amount=d.type==='Productos'?lines.reduce((n,l)=>n+l.amount,0):Math.round(d.amount*100);
  if(amount<=0||amount>10000000000)throw Error('Revisá el importe del comprobante.');
  add('INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?)',id,d.date,d.due,d.supplier,d.label,d.area,d.type==='Productos'?'Productos':d.category,amount,d.kind);
  add('INSERT INTO purchase_documents VALUES (?,?,?,?,?)',id,d.invoice,d.type,d.responsible,d.observation);
  for(const l of lines){add('INSERT INTO purchase_lines VALUES (?,?,?,?,?,?,?)',l.id,id,l.product,l.category,l.qty,l.cost,l.amount);if(d.received)add('INSERT INTO purchase_receipts VALUES (?,?,?,?,?,?)',uuid(),l.id,d.date,l.qty,d.responsible,d.observation);}
  const files=d.files.length?await appendAttachments(add,id,d.files,identity!):[];
  return {after:{expense:id,files}};
 }
if(op.action==='purchaseReceive'){
  const d=op.data;for(const l of d.lines){if(!await db.prepare('SELECT id FROM purchase_lines WHERE id=? AND expense=?').bind(l.line,d.expense).first())throw Error('La línea no pertenece a la compra.');add('INSERT INTO purchase_receipts VALUES (?,?,?,?,?,?)',uuid(),l.line,d.date,l.qty,d.responsible,d.observation);}return {};
 }
if(op.action==='supplierPay'){
  const d=op.data,e=await db.prepare('SELECT * FROM expenses WHERE id=?').bind(d.expense).first<HotelTables['expenses']>();if(!e)throw Error('Comprobante inexistente.');
  const id=cash(d.date,d.account,-Math.round(d.amount*100),e.area,'Pago',e.id,e.label);
  add('INSERT INTO supplier_payment_details VALUES (?,?,?)',id,d.reference,d.responsible);const files=d.files.length?await appendAttachments(add,e.id,d.files,identity!,id):[];return {after:{cash:id,files}};
 }
 return {};
}
