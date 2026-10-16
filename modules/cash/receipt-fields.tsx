'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { currency } from '@/lib/hotel-view';
import { Choice } from '@/modules/shared/planning-ui';
import { convertedCents,rateLabel,receiptForCash,receiptText,usd } from '@/modules/cash/currency';
import type { HotelData } from '@/lib/hotel-types';

export function ReceiptFields({applied,accountOptions=['Efectivo','Banco','Billetera']}:{applied:number;accountOptions?:string[]}){
 const [unit,setUnit]=useState('ARS'),[account,setAccount]=useState(accountOptions[0]??'Efectivo'),[amount,setAmount]=useState(''),[rate,setRate]=useState('');
 let equivalent=0;try{equivalent=convertedCents(Math.round(Number(amount)*100),Math.round(Number(rate)*10000));}catch{}
 const change=equivalent-applied;
 return <><Choice label="Moneda del cobro" name="currency" value={unit} options={['ARS','USD']} onChange={v=>{setUnit(v);if(v==='USD')setAccount('Efectivo');}}/><Choice label="Cuenta de ingreso" name="account" value={account} onChange={setAccount} options={unit==='USD'?['Efectivo']:accountOptions}/>
 {unit==='USD'&&<><label className="field"><span>Efectivo recibido (USD)</span><Input name="usdAmount" type="number" min="0.01" max="1000000" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="field"><span>Cotización acordada · ARS por 1 USD</span><Input name="exchangeRate" type="number" min="0.0001" max="1000000" step="0.0001" required value={rate} onChange={e=>setRate(e.target.value)}/></label>
 <p className="form-note">Recibido: {usd(Math.round(Number(amount)*100)||0)} · Equivalente: {currency(equivalent)} · Se aplica: {currency(applied||0)}. {change>=0?'Vuelto en ARS: '+currency(change):'El efectivo recibido todavía no alcanza.'} La cotización se guarda en este cobro y no modifica tarifas ni pagos anteriores.</p>
 {change>0&&<label className="tick" key={amount+':'+rate+':'+applied}><input name="confirmChange" type="checkbox" required/>Confirmo que entrego {currency(change)} de vuelto en efectivo ARS.</label>}
 </>}
 </>;
}
export function ReceiptSummary({data,movement}:{data:Pick<HotelData,'cash_receipts'>;movement:string}){
 const receipt=receiptForCash(data,movement);return receipt?<small>{receiptText(receipt)}{JSON.parse(receipt.movements).length>1?' · cobro conjunto de mesa':''}</small>:<small>ARS</small>;
}
export { rateLabel };
