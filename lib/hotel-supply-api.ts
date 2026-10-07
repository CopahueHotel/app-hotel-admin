import { supplyOperations as operations0, planSupply as plan0 } from '@/modules/beverages/operations';
import { supplyOperations as operations1, planSupply as plan1 } from '@/modules/purchases/operations';
import { z } from 'zod';
export const supplyOperations=z.discriminatedUnion('action',[...operations0.options,...operations1.options]);
export async function planSupply(db:D1Database,action:string,input:unknown,add:(sql:string,...v:unknown[])=>void){
 const result0=await plan0(db,action,input,add);if(result0!==null)return result0;
 const result1=await plan1(db,action,input,add);if(result1!==null)return result1;
return null;}
type Add=(sql:string,...values:unknown[])=>void;
export const productRubros=['Bebidas','Alimentos','Limpieza','Amenities','Reutilizables'] as const;
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
