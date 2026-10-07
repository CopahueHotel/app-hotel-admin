'use client';

import type { CashMovement,Expense,HotelData } from '@/lib/hotel-types';

import { Input } from '@/components/ui/input';
import { currency } from '@/lib/hotel-view';
import { ActionButton as Button } from '@/modules/access/context';
import { DataTable,sum } from '@/modules/shared/hotel-ui';
import { Download } from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
type Props={reportFrom:string;
setReportFrom:Dispatch<SetStateAction<string>>;
reportTo:string;
setReportTo:Dispatch<SetStateAction<string>>;
exportCsv:() => void;
cash:CashMovement[];
expenses:Expense[];
data:HotelData};
export function ReportsScreen({reportFrom,setReportFrom,reportTo,setReportTo,exportCsv,cash,expenses,data}:Props){return <><div className="toolbar"><div className="inline-controls"><label className="field"><span>Desde</span><Input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)}/></label><label className="field"><span>Hasta</span><Input type="date" value={reportTo} min={reportFrom} onChange={e=>setReportTo(e.target.value)}/></label></div><Button variant="outline" onClick={exportCsv} permission="reports.export"><Download size={16}/> Exportar movimientos</Button></div><div className="notice">Los cobros incluyen señas. Las compras incluyen insumos todavía en stock: este informe de movimientos no calcula utilidad contable.</div><section className="panel"><div className="panel-heading"><h2>Movimientos de fondos por actividad</h2></div><DataTable heads={['Actividad','Cobros / ventas cobradas','Pagos','Neto de fondos']} rows={['Hotel','Restaurante','Compartido'].map(ar=>{const ms=cash.filter((m)=>m.date>=reportFrom&&m.date<=reportTo&&m.area===ar),ins=sum(ms.filter((m)=>['Cobro','Venta'].includes(m.kind)),m=>m.amount),outs=-sum(ms.filter((m)=>m.kind==='Pago'),m=>m.amount);return [ar,currency(ins),currency(outs),currency(ins-outs)]})}/></section><section className="panel spaced"><div className="panel-heading"><h2>Gastos registrados por categoría</h2></div><DataTable heads={['Categoría','Importe']} rows={[...new Set(expenses.map((e)=>e.category))].map(cat=>[cat,currency(sum(expenses.filter((e)=>e.category===cat&&e.date>=reportFrom&&e.date<=reportTo),e=>e.amount))])}/></section><section className="panel spaced"><div className="panel-heading"><h2>Historial de cambios</h2></div><DataTable heads={['Fecha y hora','Responsable','Acción']} rows={data.audit_log.slice().sort((a,b)=>b.created.localeCompare(a.created)).slice(0,20).map((a)=>[new Date(a.created).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}),a.actor,({booking:'Nueva reserva',sale:'Consumo',payment:'Cobro',expense:'Gasto',purchase:'Compra',stock:'Movimiento de stock',close:'Cierre diario',status:'Estado de reserva',room:'Estado de habitación',settings:'Configuración',product:'Nuevo producto',meal:'Elección de comida',payExpense:'Pago a proveedor',transfer:'Transferencia',movement:'Aporte / retiro'} as Record<string,string>)[a.action]||a.action])}/></section></>;}
