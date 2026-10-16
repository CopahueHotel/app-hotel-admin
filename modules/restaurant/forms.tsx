'use client';

import type { Product } from '@/lib/hotel-types';
import { Input } from '@/components/ui/input';
import { ReceiptFields } from '@/modules/cash/receipt-fields';
import { Choice,Field,type EntryForm } from '@/modules/shared/hotel-ui';
import { useState } from 'react';
export function SaleFields({form,choiceBookings,mealPrice,accountOpts}:{form:EntryForm;choiceBookings:string[][];products:Product[];mealPrice:number;accountOpts:string[][]}){
 const[kind,setKind]=useState('Comida'),[service,setService]=useState('Cena'),[qty,setQty]=useState('1'),[price,setPrice]=useState(String(mealPrice/100)),[charge,setCharge]=useState(!!form.charge);
 return <><Choice label="Cliente / estadía" name="booking" defaultValue={form.booking||'external'} options={[["external","Cliente externo / interno"],...choiceBookings]}/><Field label="Nombre para cliente externo" name="customer" value="Cliente externo"/><Choice label="Tipo de consumo de comida" name="kind" value={kind} onChange={setKind} options={['Comida','Cortesía','Interno'].map(x=>[x,x])}/><input name="product" type="hidden" value="none"/><Choice label="Servicio de comida" name="service" value={service} onChange={setService} options={['Desayuno','Almuerzo','Cena'].map(x=>[x,x])}/><input name="label" type="hidden" value={service}/><label className="field"><span>Cantidad / personas</span><Input name="qty" type="number" required value={qty} onChange={e=>setQty(e.target.value)} min="1" step="1"/></label><label className="field"><span>Precio por persona (ARS)</span><Input name="price" type="number" required value={kind==='Comida'?price:'0'} onChange={e=>setPrice(e.target.value)} min="0" step="0.01"/></label><label className="tick"><input type="checkbox" checked={charge} onChange={e=>setCharge(e.target.checked)}/>Cargar a la estadía (sin cobrar ahora)</label><input name="charge" type="hidden" value={String(charge)}/>{kind==='Comida'&&!charge?<ReceiptFields applied={Math.round(Number(price)*Number(qty)*100)} accountOptions={accountOpts.map(a=>a[0])}/>:<input name="account" type="hidden" value="Efectivo"/>}<p className="form-note">Las bebidas se registran desde Bebidas y cuentas de mesa en Restaurante.</p></>
}
