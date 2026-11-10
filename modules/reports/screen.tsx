'use client';

import type { CashMovement,Expense,HotelData } from '@/lib/hotel-types';

import { Input } from '@/components/ui/input';
import { Tabs,TabsList,TabsTrigger,TabsContent } from '@/components/ui/tabs';
import { StatisticsOverview,useStatisticsReport } from '@/modules/reports/statistics-screen';
import type { StatisticsScope } from '@/modules/reports/statistics';
import { hotelDate } from '@/lib/hotel-meals';
import { currency } from '@/lib/hotel-view';
import { ActionButton as Button } from '@/modules/access/context';
import { DataTable,sum } from '@/modules/shared/hotel-ui';
import { Download,RefreshCw } from 'lucide-react';
import { useState,type Dispatch,type SetStateAction } from 'react';
type Props={reportFrom:string;
setReportFrom:Dispatch<SetStateAction<string>>;
reportTo:string;
setReportTo:Dispatch<SetStateAction<string>>;
exportCsv:() => void;
cash:CashMovement[];
expenses:Expense[];
data:HotelData};
function FinancialReport({reportFrom,reportTo,cash,expenses,data}:Props){return <><div className="notice">Los cobros incluyen señas. Las compras incluyen insumos todavía en stock: este informe de movimientos no calcula utilidad contable. Todos los importes se expresan en ARS; los cobros USD usan la cotización guardada al cobrarlos. No se suman pesos y dólares físicos ni se revalúan pagos anteriores.</div><section className="panel"><div className="panel-heading"><h2>Movimientos de fondos por actividad</h2></div><DataTable heads={['Actividad','Cobros / ventas cobradas','Pagos','Neto de fondos']} rows={['Hotel','Restaurante','Compartido'].map(ar=>{const ms=cash.filter((m)=>m.date>=reportFrom&&m.date<=reportTo&&m.area===ar),ins=sum(ms.filter((m)=>['Cobro','Venta'].includes(m.kind)),m=>m.amount),outs=-sum(ms.filter((m)=>m.kind==='Pago'),m=>m.amount);return [ar,currency(ins),currency(outs),currency(ins-outs)]})}/></section><section className="panel spaced"><div className="panel-heading"><h2>Gastos registrados por categoría</h2></div><DataTable heads={['Categoría','Importe']} rows={[...new Set(expenses.map((e)=>e.category))].map(cat=>[cat,currency(sum(expenses.filter((e)=>e.category===cat&&e.date>=reportFrom&&e.date<=reportTo),e=>e.amount))])}/></section><section className="panel spaced"><div className="panel-heading"><h2>Historial de cambios</h2></div><DataTable heads={['Fecha y hora','Responsable','Acción']} rows={data.audit_log.slice().sort((a,b)=>b.created.localeCompare(a.created)).slice(0,20).map((a)=>[new Date(a.created).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}),a.actor,({booking:'Nueva reserva',sale:'Consumo',payment:'Cobro',expense:'Gasto',purchase:'Compra',stock:'Movimiento de stock',close:'Cierre diario',status:'Estado de reserva',room:'Estado de habitación',settings:'Configuración',product:'Nuevo producto',meal:'Elección de comida',payExpense:'Pago a proveedor',transfer:'Transferencia',movement:'Aporte / retiro'} as Record<string,string>)[a.action]||a.action])}/></section></>;}

export function ReportsScreen(props:Props){
 const [tab,setTab]=useState('statistics'),[month,setMonth]=useState(()=>hotelDate().slice(0,7)),[scope,setScope]=useState<StatisticsScope>('realized');
 const statistics=useStatisticsReport(month,scope,tab==='statistics');
 return <Tabs value={tab} onValueChange={setTab} className="reports-tabs">
  <div className="reports-toolbar">
   <TabsList aria-label="Tipo de informe"><TabsTrigger value="statistics">Estadísticas del hotel</TabsTrigger><TabsTrigger value="financial">Movimientos e historial</TabsTrigger></TabsList>
   <div className="reports-filters">{tab==='statistics'?<>
    <label className="field"><span>Mes y año</span><Input className="control" type="month" min="1900-01" max="2199-12" value={month} onChange={e=>{setMonth(e.target.value);if(e.target.value>hotelDate().slice(0,7))setScope('forecast');}}/></label>
    <label className="field"><span>Vista de ocupación</span><select className="control" value={scope} onChange={e=>setScope(e.target.value as StatisticsScope)}><option value="realized">Realizada · hasta ayer</option><option value="forecast">Previsión · desde hoy</option></select></label>
   </>:<>
    <label className="field"><span>Desde</span><Input className="control" type="date" value={props.reportFrom} onChange={e=>props.setReportFrom(e.target.value)}/></label>
    <label className="field"><span>Hasta</span><Input className="control" type="date" value={props.reportTo} min={props.reportFrom} onChange={e=>props.setReportTo(e.target.value)}/></label>
   </>}</div>
   <div className="reports-actions">{tab==='statistics'?<>
    <Button variant="outline" disabled={!month} onClick={statistics.refresh}><RefreshCw size={16}/> Actualizar</Button>
    <Button variant="outline" permission="reports.export" disabled={statistics.exporting||!statistics.data} onClick={statistics.exportStatistics}><Download size={16}/> {statistics.exporting?'Exportando…':'Exportar estadísticas'}</Button>
   </>:<Button variant="outline" onClick={props.exportCsv} permission="reports.export"><Download size={16}/> Exportar movimientos</Button>}</div>
  </div>
  <TabsContent value="statistics">{!month?<p className="notice">Elegí un mes para consultar las estadísticas.</p>:statistics.error?<div className="notice error" role="alert">{statistics.error}</div>:statistics.data?<StatisticsOverview data={statistics.data}/>:<p role="status" className="notice">Cargando estadísticas…</p>}</TabsContent>
  <TabsContent value="financial"><FinancialReport {...props}/></TabsContent>
 </Tabs>;
}
