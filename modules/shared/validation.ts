import { z } from 'zod';
export const validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
export const exactMoney=z.coerce.number().finite().min(0).max(100000000)
 .refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,'Usá como máximo dos decimales.');
