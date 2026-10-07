import type { OperationContext } from '@/modules/shared/operations';
import { z } from 'zod';

const money=z.coerce.number().finite().min(0).max(100000000);

const schemas={settings:z.object({mealPrice:money})};
export const legacyOperations=z.discriminatedUnion('action',[z.object({action:z.literal('settings'),data:schemas.settings})]);
export async function planLegacy(actionName:string,input:unknown,context:OperationContext){
 if(!legacyOperations.options.some(s=>s.shape.action.value===actionName))return null;
 const {action,data:d}=legacyOperations.parse({action:actionName,data:input});
 const {add,cents}=context;
 if(action==='settings')add("UPDATE settings SET value=? WHERE key='mealPrice'",String(cents(d.mealPrice)));

 return {};
}
