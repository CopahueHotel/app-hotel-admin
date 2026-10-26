'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ReceiptFields } from '@/modules/cash/receipt-fields';
export function initialPaymentFromForm(values:Record<string,unknown>){return values.initialPayment==='on'?{date:values.depositDate,amount:values.depositAmount,account:values.account,currency:values.currency,usdAmount:values.usdAmount,exchangeRate:values.exchangeRate,confirmChange:values.confirmChange}:undefined;}
export function InitialPaymentFields({date}:{date:string}){
 const [enabled,setEnabled]=useState(false),[amount,setAmount]=useState('');
 return <section className="reservation-section full-width"><label className="tick"><input name="initialPayment" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Registrar seña recibida ahora</label>{enabled&&<div className="form-grid"><label className="field"><span>Fecha del cobro</span><Input name="depositDate" type="date" defaultValue={date} required/></label><label className="field"><span>Seña aplicada (ARS)</span><Input name="depositAmount" type="number" value={amount} onChange={e=>setAmount(e.target.value)} min="0.01" step="0.01" required/></label><ReceiptFields applied={Math.round(Number(amount)*100)}/><p className="form-note">Es un cobro real. La reserva y la seña se guardan juntas; si falla una operación, no se guarda ninguna.</p></div>}</section>;
}
