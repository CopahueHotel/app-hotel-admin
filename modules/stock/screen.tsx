'use client';

import type { HotelData,Product } from '@/lib/hotel-types';
import type { EntryForm } from '@/modules/shared/hotel-ui';

import { ActionButton as Button } from '@/modules/access/context';
import { DataTable,fmt,Pick } from '@/modules/shared/hotel-ui';
import { Download,Plus } from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
type Props={stockCategory:string;
setStockCategory:Dispatch<SetStateAction<string>>;
low:Product[];
open:(action:string,initial?:Omit<EntryForm,'action'>)=>void;
exportCsv:() => void;
filteredProducts:Product[];
stock:(p:Product)=>number;
ledger:HotelData['stock_movements'];
products:Product[]};
export function StockScreen({stockCategory,setStockCategory,low,open,exportCsv,filteredProducts,stock,ledger,products}:Props){return <><div className="toolbar"><div className="inline-controls"><Pick value={stockCategory} onChange={setStockCategory} options={['Todos','Bebidas','Alimentos','Limpieza','Amenities','Limpieza y amenities','Reutilizables'].map(x=>[x,x])}/><span className="muted">{low.length} productos por debajo del mínimo</span></div><div className="inline-controls"><Button variant="outline" onClick={()=>open('product')} permission="stock.create"><Plus size={16}/> Producto</Button><Button variant="outline" onClick={exportCsv} permission="stock.export"><Download size={16}/> Exportar</Button></div></div><section className="panel"><DataTable heads={['Producto','Categoría','Ubicación','Stock','Mínimo','Estado','']} rows={filteredProducts.map((p)=>[p.name,p.category,p.location,`${stock(p).toLocaleString('es-AR')} ${p.unit}`,`${p.minimum} ${p.unit}`,<span key="cell-7" className={'tag '+(stock(p)<p.minimum?'amber':'green')}>{stock(p)<p.minimum?'Reponer':'En stock'}</span>,<Button key="cell-8" variant="outline" size="sm" onClick={()=>open('stock',{product:p.id})} permission="stock.edit">Movimiento / conteo</Button>])}/></section><section className="panel spaced"><div className="panel-heading"><h2>Últimos movimientos</h2></div><DataTable heads={['Fecha','Producto','Cantidad','Motivo']} rows={ledger.slice().reverse().slice(0,15).map((m)=>[fmt(m.date),products.find((p)=>p.id===m.product)?.name,`${m.qty>0?'+':''}${m.qty}`,m.reason])}/></section></>;}
