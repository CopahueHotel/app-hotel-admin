import { z } from 'zod';
import { validDate } from '@/modules/shared/validation';
export const origins=['Web','WhatsApp','Redes','Booking','Recomendación','Otro'] as const;
export const inquiryStates=['Nueva consulta','Presupuesto enviado','Pendiente de respuesta','Pendiente de seña','Convertida en reserva','Cerrada sin reserva'] as const;
export const consentStates=['Sin información','Autorizado','Rechazado','Revocado'] as const;
export const emailKey=(value:string)=>value.trim().toLowerCase();
export function phoneKey(value:string){const digits=value.replace(/\D/g,'');return value.trim().startsWith('00')?digits.slice(2):digits;}
const optionalText=z.string().trim().max(240).default(''),notes=z.string().trim().max(4000).default('');
const optionalDate=z.union([validDate,z.literal('')]).default('');
export const customerDetails=z.object({name:z.string().trim().min(1).max(240),email:optionalText.refine(value=>!value||z.string().email().safeParse(value).success),phone:optionalText,locality:optionalText,province:optionalText,country:optionalText,origin:z.enum(origins).default('Otro'),duplicateConfirmed:z.boolean().default(false)});
export const customerSchema=customerDetails.extend({id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0),notes:notes.optional(),consent:z.enum(consentStates).optional(),consentDate:optionalDate,consentSource:optionalText});
export const inquirySchema=z.object({id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0),customer:z.string().min(1),date:validDate,channel:z.enum(origins),start:optionalDate,end:optionalDate,pax:z.preprocess(value=>value===''||value===undefined?null:value,z.coerce.number().int().min(1).max(500).nullable()),status:z.enum(inquiryStates).default('Nueva consulta'),notes:notes.optional(),nextAction:optionalText,followup:optionalDate});
export const pendingInquiry=(status:string)=>!['Convertida en reserva','Cerrada sin reserva'].includes(status);
