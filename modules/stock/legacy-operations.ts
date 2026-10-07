import type { OperationContext } from '@/modules/shared/operations';
import { z } from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const str=z.string().trim().min(1).max(240),money=z.coerce.number().finite().min(0).max(100000000);

const schemas={stock:z.object({date,product:str,qty:z.coerce.number().finite().min(-100000).max(100000),reason:z.enum(['Entrega a cocina','Entrega a limpieza','Merma','Rotura / pérdida','Conteo físico','Consumo interno'])}),
product:z.object({name:str,category:z.enum(['Bebidas','Alimentos','Limpieza','Amenities','Limpieza y amenities','Reutilizables']),unit:z.enum(['un','kg','l']),minimum:money,price:money,location:str})};
export const legacyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('stock'),data:schemas.stock}),z.object({action:z.literal('product'),data:schemas.product})]);
export async function planLegacy(actionName:string,input:unknown,context:OperationContext){
 if(!legacyOperations.options.some(s=>s.shape.action.value===actionName))return null;
 const {action,data:d}=legacyOperations.parse({action:actionName,data:input});
 const {db,add,row,id,cents}=context;
 if(action==='stock'){const p=await row('products','id',d.product);if(!p)throw new Error('Producto inexistente');const s=await db.prepare('SELECT COALESCE(SUM(qty),0) n FROM stock_movements WHERE product=?').bind(d.product).first<{n:number}>();const delta=d.reason==='Conteo físico'?d.qty-(s?.n??0):-Math.abs(d.qty);if(d.reason==='Conteo físico'&&d.qty<0)throw new Error('El conteo no puede ser negativo');if((s?.n??0)+delta<0)throw new Error('La salida supera el stock.');if(delta===0)throw new Error('No hay una diferencia para registrar.');add('INSERT INTO stock_movements VALUES (?,?,?,?,?,?)',id(),d.date,d.product,delta,d.reason,'');}
if(action==='product')add('INSERT INTO products VALUES (?,?,?,?,?,?,?)',id(),d.name,d.category,d.unit,d.minimum,cents(d.price),d.location);

 return {};
}
