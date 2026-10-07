import type { OperationContext } from '@/modules/shared/operations';
import { z } from 'zod';



const schemas={room:z.object({room:z.coerce.number().int(),state:z.enum(['Limpia','Pendiente de limpieza','Fuera de servicio']),note:z.string().max(1000).default('')})};
export const legacyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('room'),data:schemas.room})]);
export async function planLegacy(actionName:string,input:unknown,context:OperationContext){
 if(!legacyOperations.options.some(s=>s.shape.action.value===actionName))return null;
 const {action,data:d}=legacyOperations.parse({action:actionName,data:input});
 const {add,row}=context;
 if(action==='room'){if(!await row('rooms','id',d.room))throw new Error('Habitación inexistente');add('UPDATE rooms SET state=?,note=? WHERE id=?',d.state,d.note,d.room);}

 return {};
}
