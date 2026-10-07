import type { HotelData, Expense } from './hotel-types';
import { serializeCsv } from './hotel-view';
import { remainingAmount } from '@/modules/shared/money';
export function supplierBalance(data:HotelData,e:Expense,date?:string){
 const paid=Math.max(0,-data.cash_movements.filter(m=>m.kind==='Pago'&&m.ref===e.id&&(!date||m.date<=date)).reduce((n,m)=>n+m.amount,0));
 const balance=remainingAmount(e.amount,0,paid);
 return {paid,balance,status:balance===0?'Pagado':paid>0?'Parcialmente pagado':'Pendiente'};
}
export function dueLabel(e:Expense,balance:number,date:string){
 if(!balance)return 'Pagado';
 if(!e.due)return 'Vencimiento sin definir';
 const days=Math.round((Date.parse(e.due+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000);
 return days<0?'Vencido':days===0?'Vence hoy':days<=7?'Próximo a vencer (7 días)':'A vencer';
}
export function receiptPending(data:HotelData,line:HotelData['purchase_lines'][number],date?:string){
 return Math.max(0,Math.round((line.qty-data.purchase_receipts.filter(r=>r.line===line.id&&(!date||r.date<=date)).reduce((n,r)=>n+r.qty,0))*1000)/1000);
}
export function tableTotal(data:HotelData,account:string){
 return data.beverage_dispatches.filter(d=>d.table_account===account&&d.mode==='Pendiente'&&!data.beverage_corrections.some(c=>c.dispatch===d.sale)).reduce((n,d)=>n+(data.sales.find(s=>s.id===d.sale)?.amount??0),0);
}
export function dispatchStatus(data:HotelData,id:string){
 const d=data.beverage_dispatches.find(d=>d.sale===id);
 if(!d)return 'Histórico · sin destino registrado';
 if(data.beverage_corrections.some(c=>c.dispatch===id))return 'Corregido';
 if(d.mode==='Sin cobro')return 'Sin cobro · '+d.destination;
 if(d.mode==='Inmediato')return 'Cobrado';
 if(d.mode==='Estadía')return 'Cargo a estadía';
 const settled=data.beverage_settlements.find(s=>s.table_account===d.table_account);
 return settled?settled.method==='Cobro'?'Cobrado':'Transferido a estadía':'Pendiente de cobro';
}
export function supplierCsv(data:HotelData,expenses:Expense[],date:string){
 return serializeCsv([['Proveedor','Concepto','Comprobante','Fecha','Vencimiento','Actividad','Tipo','Rubros','Total ARS','Pagado al '+date+' ARS','Saldo ARS','Estado','Vencimiento / consulta','Recepción'],...expenses.map(e=>{
  const state=supplierBalance(data,e,date),doc=data.purchase_documents.find(d=>d.expense===e.id),lines=data.purchase_lines.filter(l=>l.expense===e.id);
  return [e.supplier,e.label,doc?.invoice??'Histórico',e.date,e.due||'Vencimiento sin definir',e.area,e.kind,lines.length?[...new Set(lines.map(l=>l.category))].join(', '):e.category,e.amount/100,state.paid/100,state.balance/100,state.status,dueLabel(e,state.balance,date),doc?.type==='Productos'?lines.some(l=>receiptPending(data,l,date)>0)?'Pendiente / parcial':'Recibido':doc?'No corresponde':'Histórica · sin reinterpretar'];
 })]);
}
