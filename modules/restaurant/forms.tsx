'use client';

import type { Product } from '@/lib/hotel-types';
import { Choice,Field,Tick,type EntryForm } from '@/modules/shared/hotel-ui';
import { useState } from 'react';
export function SaleFields({form,choiceBookings,mealPrice,accountOpts}:{form:EntryForm;choiceBookings:string[][];products:Product[];mealPrice:number;accountOpts:string[][]}){
 const[kind,setKind]=useState('Comida'),[service,setService]=useState('Cena');
 return <><Choice label="Cliente / estadía" name="booking" defaultValue={form.booking||'external'} options={[["external","Cliente externo / interno"],...choiceBookings]}/><Field label="Nombre para cliente externo" name="customer" value="Cliente externo"/><Choice label="Tipo de consumo de comida" name="kind" value={kind} onChange={setKind} options={['Comida','Cortesía','Interno'].map(x=>[x,x])}/><input name="product" type="hidden" value="none"/><Choice label="Servicio de comida" name="service" value={service} onChange={setService} options={['Desayuno','Almuerzo','Cena'].map(x=>[x,x])}/><input name="label" type="hidden" value={service}/><Field label="Cantidad / personas" name="qty" type="number" value="1" min="1" step="1"/><Field key={kind} label="Precio por persona (ARS)" name="price" type="number" value={kind==='Comida'?mealPrice/100:0} min="0" step="0.01"/><Choice label="Cuenta para cobro inmediato" name="account" options={accountOpts}/><Tick label="Cargar a la estadía (sin cobrar ahora)" name="charge" initial={!!form.charge}/><p className="form-note">Las bebidas se registran desde Bebidas y cuentas de mesa en Restaurante.</p></>
}
