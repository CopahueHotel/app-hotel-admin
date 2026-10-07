import { planningOperations as operations0, planPlanning as plan0 } from '@/modules/suppliers/operations';
import { planningOperations as operations1, planPlanning as plan1 } from '@/modules/menu/operations';
import { planningOperations as operations2, planPlanning as plan2 } from '@/modules/personnel/operations';
import { z } from 'zod';
export const planningOperations=z.discriminatedUnion('action',[...operations0.options,...operations1.options,...operations2.options]);
export async function planPlanning(db:D1Database,action:string,input:unknown,add:(sql:string,...v:unknown[])=>void){
 const result0=await plan0(db,action,input,add);if(result0!==null)return result0;
 const result1=await plan1(db,action,input,add);if(result1!==null)return result1;
 const result2=await plan2(db,action,input,add);if(result2!==null)return result2;
return null;}
export const planningErrors:Record<string,string>={HOT_PLANNING_INVALID:'Revisá las fechas, el responsable y los campos del registro.',HOT_EMPLOYEE_INACTIVE:'El empleado está inactivo. Su historial se conserva; no se pueden crear nuevas asignaciones.',HOT_STAFF_CONFLICT:'Hay turnos superpuestos o una ausencia en ese intervalo. Revisá la advertencia y explicá la excepción si decidís registrar la asignación.',HOT_MENU_EXISTS:'Ya existe un menú en el destino. Revisá las fechas y confirmá expresamente su reemplazo.',HOT_DELIVERY_TERMINAL:'La entrega realizada o cancelada conserva su historial y no se modifica aquí.'};
