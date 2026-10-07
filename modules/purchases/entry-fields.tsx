'use client';

import type { Product } from '@/lib/hotel-types';
import { Choice,Field,Tick,type EntryForm } from '@/modules/shared/hotel-ui';


export function ExpenseFields({date,areas,accountOpts}:{date:string;areas:string[][];accountOpts:string[][]}){return <><Field label="Concepto" name="label"/><Field label="Proveedor" name="supplier"/><Field label="Vencimiento" name="due" type="date" value={date}/><Choice label="Actividad" name="area" options={areas}/><Choice label="Categoría" name="category" options={['Servicios','Sueldos','Mantenimiento','Limpieza','Impuestos','Otros'].map(x=>[x,x])}/><Choice label="Tipo de gasto" name="kind" options={['Variable','Fijo'].map(x=>[x,x])}/><Field label="Importe (ARS)" name="amount" type="number" min="0.01" step="0.01"/><Choice label="Cuenta de pago" name="account" options={accountOpts}/><Tick name="paid" label="Pagado en su totalidad"/></>;}

export function PayExpenseFields({form,accountOpts}:{form:EntryForm;accountOpts:string[][]}){return <><input name="id" type="hidden" value={form.id}/><Field label="Importe a pagar (ARS)" name="amount" type="number" min="0.01" step="0.01" value={form.amount}/><Choice label="Cuenta de pago" name="account" options={accountOpts}/></>;}

export function PurchaseFields({products,date,accountOpts}:{products:Product[];date:string;accountOpts:string[][]}){return <><Field label="Proveedor" name="supplier"/><Choice label="Producto" name="product" options={products.map((p)=>[p.id,`${p.name} (${p.unit})`])}/><Field label="Cantidad en unidad de control" name="qty" type="number" min="0.001" step="0.001"/><Field label="Costo por unidad (ARS)" name="cost" type="number" min="0.01" step="0.01"/><Field label="Vencimiento" name="due" type="date" value={date}/><Choice label="Cuenta de pago" name="account" options={accountOpts}/><Tick name="paid" label="Compra pagada"/></>;}
