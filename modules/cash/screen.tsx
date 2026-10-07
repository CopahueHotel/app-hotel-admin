'use client';

import type { CashMovement,HotelData } from '@/lib/hotel-types';
import type { EntryForm } from '@/modules/shared/hotel-ui';

import { currency } from '@/lib/hotel-view';
import { ActionButton as Button } from '@/modules/access/context';
import { DataTable,fmt,Pick,sum } from '@/modules/shared/hotel-ui';
import { Download } from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
type Props={accounts:string[];
cash:CashMovement[];
date:string;
open:(action:string,initial?:Omit<EntryForm,'action'>)=>void;
exportCsv:() => void;
area:string;
setArea:Dispatch<SetStateAction<string>>;
filteredCash:CashMovement[];
data:HotelData};
export function CashScreen({accounts,cash,date,open,exportCsv,area,setArea,filteredCash,data}:Props){return <><div className="account-grid">{accounts.map(a=><div className="panel account-card" key={a}><span>{a}</span><strong>{currency(sum(cash.filter((m)=>m.account===a&&m.date<=date),m=>m.amount))}</strong><small>Saldo al {fmt(date)}</small></div>)}</div><div className="toolbar"><div className="inline-controls"><Button variant="outline" onClick={()=>open('payment')} permission="reservations.collect">Registrar cobro</Button><Button variant="outline" onClick={()=>open('transfer')} permission="cash.create">Transferir entre cuentas</Button><Button variant="outline" onClick={()=>open('movement')} permission="cash.create">Aporte / retiro</Button></div><Button variant="outline" onClick={exportCsv} permission="cash.export"><Download size={16}/> Exportar</Button></div><section className="panel"><div className="panel-heading"><h2>Movimientos del día</h2><Pick value={area} onChange={setArea} options={['Todo','Hotel','Restaurante'].map(x=>[x,x])}/></div><DataTable heads={['Concepto','Actividad','Cuenta','Tipo','Importe']} rows={filteredCash.map((m)=>[m.label,m.area,m.account,m.kind,<span key="cell-4" className={m.amount>=0?'positive':'negative'}>{m.amount>0?'+':''}{currency(m.amount)}</span>])}/></section><section className="panel spaced"><div className="panel-heading"><h2>Cierres diarios</h2></div><DataTable heads={['Fecha','Esperado','Contado','Diferencia','Observación']} rows={data.daily_closes.sort((a,b)=>b.date.localeCompare(a.date)).map((c)=>[fmt(c.date),currency(c.expected),currency(c.counted),currency(c.counted-c.expected),c.note||'Sin diferencias'])}/></section></>;}
