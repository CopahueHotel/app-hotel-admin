import { z } from 'zod';
import { exactMoney,validDate } from '@/modules/shared/validation';
import { appendReceipt,receiptFields } from '@/modules/cash/currency';
export const initialPaymentSchema=z.object({date:validDate,amount:exactMoney.refine(v=>v>0),account:z.enum(['Efectivo','Banco','Billetera']),...receiptFields});
export function appendInitialPayment(add:(sql:string,...v:unknown[])=>void,ref:string,label:string,payment:z.infer<typeof initialPaymentSchema>,limit:number,actor:string){
 const amount=Math.round(payment.amount*100);if(amount>limit)throw Error('El cobro supera el saldo pendiente.');
 const id=crypto.randomUUID();add('INSERT INTO cash_movements VALUES (?,?,?,?,?,?,?,?)',id,payment.date,payment.account,amount,'Hotel','Cobro',ref,label);
 appendReceipt(add,payment.date,payment,amount,payment.account,[id],actor);
}
