'use client';

import type { CashMovement } from '@/lib/hotel-types';
import { currency } from '@/lib/hotel-view';
import { Choice,Field,type EntryForm } from '@/modules/shared/hotel-ui';

import { fmt,sum } from '@/modules/shared/hotel-ui';


export function PaymentFields({form,choiceBookings,accountOpts}:{form:EntryForm;choiceBookings:string[][];accountOpts:string[][]}){return <><Choice label="Estadía" name="booking" defaultValue={form.booking} options={choiceBookings.length?choiceBookings:[['missing','Sin estadías activas']]}/><Field label="Importe (ARS)" name="amount" type="number" min="0.01" step="0.01" value={form.amount}/><Choice label="Cuenta de ingreso" name="account" options={accountOpts}/></>;}

export function CloseFields({date,cash}:{date:string;cash:CashMovement[]}){return <><div className="form-note">Efectivo esperado al {fmt(date)}: <strong>{currency(sum(cash.filter((m)=>m.account==='Efectivo'&&m.date<=date),m=>m.amount))}</strong></div><Field label="Efectivo contado (ARS)" name="counted" type="number" min="0" step="0.01"/><Field label="Observación / motivo de diferencia" name="note" required={false}/></>;}

export function TransferFields({accountOpts}:{accountOpts:string[][]}){return <><Choice label="Desde" name="from" options={accountOpts}/><Choice label="Hacia" name="to" defaultValue="Banco" options={accountOpts}/><Field label="Importe (ARS)" name="amount" type="number" min="0.01" step="0.01"/></>;}

export function MovementFields({accountOpts}:{accountOpts:string[][]}){return <><Choice label="Tipo" name="kind" options={['Aporte de socios','Retiro de socios'].map(x=>[x,x])}/><Choice label="Cuenta" name="account" options={accountOpts}/><Field label="Importe (ARS)" name="amount" type="number" min="0.01" step="0.01"/><Field label="Detalle" name="label"/></>;}
