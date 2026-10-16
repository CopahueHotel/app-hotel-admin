'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ReceiptFields } from '@/modules/cash/receipt-fields';
import { cashBalances,usd } from '@/modules/cash/currency';
import type { HotelData,CashMovement } from '@/lib/hotel-types';
import { currency } from '@/lib/hotel-view';
import { Choice,Field,type EntryForm } from '@/modules/shared/hotel-ui';

import { fmt } from '@/modules/shared/hotel-ui';


export function PaymentFields({form,choiceBookings,accountOpts}:{form:EntryForm;choiceBookings:string[][];accountOpts:string[][]}){const [amount,setAmount]=useState(String(form.amount??''));return <><Choice label="Estadía" name="booking" defaultValue={form.booking} options={choiceBookings.length?choiceBookings:[['missing','Sin estadías activas']]}/><label className="field"><span>Importe a aplicar a la estadía (ARS)</span><Input name="amount" type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><ReceiptFields applied={Math.round(Number(amount)*100)} accountOptions={accountOpts.map(a=>a[0])}/></>;}

export function CloseFields({date,cash,data}:{date:string;cash:CashMovement[];data:HotelData}){const balance=cashBalances(cash,data,date);return <><div className="form-note">Efectivo esperado al {fmt(date)}: <strong>ARS {currency(balance.ars)} · {usd(balance.usd)}</strong>. Contá ambas monedas por separado.</div><Field label="Efectivo contado (ARS)" name="counted" type="number" min="0" step="0.01"/><Field label="Efectivo contado (USD)" name="countedUSD" type="number" min="0" step="0.01"/><Field label="Observación / motivo de diferencia" name="note" required={false}/><p className="form-note">Las diferencias en USD se conservan en su moneda. No se valorizan con una cotización nueva ni generan cobros.</p></>;}

export function TransferFields({accountOpts}:{accountOpts:string[][]}){return <><Choice label="Desde" name="from" options={accountOpts}/><Choice label="Hacia" name="to" defaultValue="Banco" options={accountOpts}/><Field label="Importe (ARS)" name="amount" type="number" min="0.01" step="0.01"/></>;}

export function MovementFields({accountOpts}:{accountOpts:string[][]}){return <><Choice label="Tipo" name="kind" options={['Aporte de socios','Retiro de socios'].map(x=>[x,x])}/><Choice label="Cuenta" name="account" options={accountOpts}/><Field label="Importe (ARS)" name="amount" type="number" min="0.01" step="0.01"/><Field label="Detalle" name="label"/></>;}
