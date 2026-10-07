import { remainingAmount } from '@/modules/shared/money';
import type { OperationContext } from '@/modules/shared/operations';
import { z } from 'zod';

const str=z.string().trim().min(1).max(240);

const schemas={status:z.object({id:str,status:z.enum(['Confirmada','Alojado','Finalizada','Cancelada'])})};
export const legacyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('status'),data:schemas.status})]);
export async function planLegacy(actionName:string,input:unknown,context:OperationContext){
 if(!legacyOperations.options.some(s=>s.shape.action.value===actionName))return null;
 const {action,data:d}=legacyOperations.parse({action:actionName,data:input});
 const {db,add,row}=context;
 if(action==='status'){const b=await row('bookings','id',d.id);if(!b)throw new Error('Reserva inexistente');if(['Cancelada','Finalizada'].includes(b.status))throw new Error('La estadía ya está cerrada.');if(d.status==='Finalizada'){const s=await db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM sales WHERE booking=? AND account IS NULL").bind(d.id).first<{amount:number}>();const p=await db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM cash_movements WHERE ref=? AND kind='Cobro'").bind(d.id).first<{amount:number}>();if(remainingAmount(b.amount,s?.amount??0,p?.amount??0)>0)throw new Error('Registrá el cobro pendiente antes de finalizar.');}if(d.status==='Cancelada'){const p=await db.prepare("SELECT COUNT(*) n FROM cash_movements WHERE ref=?").bind(d.id).first<{n:number}>();const s=await db.prepare('SELECT COUNT(*) n FROM sales WHERE booking=?').bind(d.id).first<{n:number}>();if((p?.n??0)||(s?.n??0))throw new Error('La reserva tiene movimientos. La devolución o regularización requiere revisión; no se puede cancelar aquí.');add('DELETE FROM room_nights WHERE booking=?',d.id);}add('UPDATE bookings SET status=? WHERE id=?',d.status,d.id);if(d.status==='Finalizada')add("UPDATE rooms SET state='Pendiente de limpieza' WHERE id=?",b.room);}

 return {};
}
