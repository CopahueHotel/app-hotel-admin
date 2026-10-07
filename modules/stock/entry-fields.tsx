'use client';

import type { Product } from '@/lib/hotel-types';
import { Choice,Field,type EntryForm } from '@/modules/shared/hotel-ui';

export function StockFields({form,products}:{form:EntryForm;products:Product[]}){return <><Choice label="Producto" name="product" defaultValue={form.product} options={products.map((p)=>[p.id,`${p.name} (${p.unit})`])}/><Choice label="Motivo" name="reason" options={['Entrega a cocina','Entrega a limpieza','Merma','Rotura / pérdida','Conteo físico','Consumo interno'].map(x=>[x,x])}/><Field label="Cantidad de salida o stock contado" name="qty" type="number" min="0" step="0.001"/><p className="form-note">En un conteo, ingresá la existencia encontrada. En los demás movimientos, ingresá la cantidad que sale.</p></>;}

export function ProductFields(){return <><Field label="Nombre" name="name"/><Choice label="Categoría" name="category" options={['Bebidas','Alimentos','Limpieza','Amenities','Limpieza y amenities','Reutilizables'].map(x=>[x,x])}/><Choice label="Unidad de control" name="unit" options={['un','kg','l'].map(x=>[x,x])}/><Field label="Stock mínimo" name="minimum" type="number" min="0" step="0.001" value="0"/><Field label="Precio de venta por unidad (ARS)" name="price" type="number" min="0" step="0.01" value="0"/><Field label="Ubicación" name="location" value="Depósito"/></>;}
