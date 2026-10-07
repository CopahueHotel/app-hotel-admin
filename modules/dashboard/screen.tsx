'use client';

import type { Booking,CashMovement,Expense,HotelData,Product } from '@/lib/hotel-types';
import type { EntryForm } from '@/modules/shared/hotel-ui';
import type { ReactNode } from 'react';

import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { currency } from '@/lib/hotel-view';
import { Allowed,ActionButton as Button } from '@/modules/access/context';
import { DataTable,Pick,sum } from '@/modules/shared/hotel-ui';
import { ArrowDownRight,ArrowUpRight,BedDouble,Package,Receipt,UtensilsCrossed,Wallet } from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
type Props={area:string;
setArea:Dispatch<SetStateAction<string>>;
date:string;
cash:CashMovement[];
accounts:string[];
staying:Booking[];
rooms:HotelData['rooms'];
available:number;
setPage:Dispatch<SetStateAction<string>>;
active:Booking[];
balance:(b:Booking)=>number;
expenses:Expense[];
owed:(e:Expense)=>number;
stay:(b:Booking)=>boolean;
guestRows:(list:Booking[])=>ReactNode[][];
diners:(meal: string) => number;
low:Product[];
stock:(p:Product)=>number;
open:(action:string,initial?:Omit<EntryForm,'action'>)=>void};
export function DashboardScreen({area,setArea,date,cash,accounts,staying,rooms,available,setPage,active,balance,expenses,owed,stay,guestRows,diners,low,stock,open}:Props){return <><div className="toolbar"><Pick value={area} onChange={setArea} options={['Todo','Hotel','Restaurante'].map(x=>[x,x==='Todo'?'Todo el establecimiento':x])}/><span className="muted">{new Date(date+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span></div><div className="kpi-grid"><Allowed permission="cash.view"><div className="kpi featured"><div className="kpi-label">Dinero disponible <Wallet size={18}/></div><strong>{currency(sum(cash.filter((m)=>m.date<=date),m=>m.amount))}</strong><span>Caja compartida · todas las cuentas</span><div className="mini-accounts">{accounts.map(a=><div key={a}>{a}<b>{currency(sum(cash.filter((m)=>m.account===a&&m.date<=date),m=>m.amount))}</b></div>)}</div></div></Allowed><Allowed permission="rooms.view"><div className="kpi"><div className="kpi-label">Ocupación <BedDouble size={18}/></div><strong>{staying.length}<small> / {rooms.length}</small></strong><span>{available} disponibles · {Math.round(staying.length/rooms.length*100)}% de ocupación</span><div className="occupancy-bars">{rooms.map((r)=><span key={r.id} className={staying.some((b)=>b.room===r.id)?'occupied':r.state==='Fuera de servicio'?'blocked':''}/>)}</div><button className="text-link" onClick={()=>setPage('Calendario')}>Ver calendario</button></div></Allowed><Allowed permission="reservations.balance"><div className="kpi"><div className="kpi-label">Pendiente de cobro <ArrowUpRight size={18}/></div><strong>{currency(sum(active,b=>Math.max(0,balance(b))))}</strong><span>{active.filter((b)=>balance(b)>0).length} estadías con saldo pendiente</span><button className="text-link" onClick={()=>setPage('Reservas')}>Revisar reservas</button></div></Allowed><Allowed permission="purchases.financial"><div className="kpi"><div className="kpi-label">Pendiente de pago <ArrowDownRight size={18}/></div><strong>{currency(sum(expenses.filter((e)=>area==='Todo'||e.area===area||e.area==='Compartido'),e=>Math.max(0,owed(e))))}</strong><span>Compras y gastos registrados</span><button className="text-link" onClick={()=>setPage('Compras y gastos')}>Ver vencimientos</button></div></Allowed></div><div className="dashboard-columns"><Allowed permission="reservations.view"><section className="panel"><div className="panel-heading"><div><h2>Movimiento del hotel</h2><p>Llegadas, salidas y estadías del día</p></div><span className="tag gray">{date.slice(8)} {new Date(date+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',month:'short'})}</span></div><Tabs defaultValue="Alojados"><TabsList>{['Alojados','Llegadas','Salidas'].map(t=><TabsTrigger key={t} value={t}>{t} <span className="tab-count">{active.filter((b)=>t==='Alojados'?stay(b):t==='Llegadas'?b.start===date:b.end===date).length}</span></TabsTrigger>)}</TabsList>{['Alojados','Llegadas','Salidas'].map(t=><TabsContent key={t} value={t}><DataTable heads={['Huésped','Estadía','Régimen','Estado','Saldo']} rows={guestRows(active.filter((b)=>t==='Alojados'?stay(b):t==='Llegadas'?b.start===date:b.end===date))}/></TabsContent>)}</Tabs></section></Allowed><aside className="dashboard-aside"><Allowed permission="meals.view"><section className="panel meals-card"><div className="panel-heading"><h2>Comensales previstos</h2><UtensilsCrossed size={19}/></div>{['Desayuno','Almuerzo','Cena'].map(m=><div className="meal-line" key={m}><span>{m}</span><strong>{diners(m)}<small> personas</small></strong></div>)}<p className="muted">Huespedes: incluye cambios de MP, suspensiones y adicionales explicitos. Clientes externos y detalle en Restaurante. Hora del hotel: Buenos Aires.</p><button className="text-link" onClick={()=>setPage('Restaurante')}>Ver restaurante</button></section></Allowed><section className="panel"><div className="panel-heading"><h2>Para revisar</h2><span className="tag amber">{low.length+rooms.filter((r)=>r.state&&r.state!=='Limpia').length}</span></div>{low.slice(0,2).map((p)=><button className="alert-item" key={p.id} onClick={()=>setPage('Stock')}><Package size={18}/><span>{p.name}<small>{stock(p)} {p.unit} · mínimo {p.minimum}</small></span><span className="tag amber">Stock bajo</span></button>)}{rooms.filter((r)=>r.state&&r.state!=='Limpia').map((r)=><button className="alert-item" key={r.id} onClick={()=>open('room',r)}><BedDouble size={18}/><span>Habitación {r.id}<small>{r.state}</small></span></button>)}</section></aside></div><section className="panel quick-actions"><span>Carga diaria</span><Button variant="outline" onClick={()=>open('sale')} permission="restaurant.create"><UtensilsCrossed size={16}/> Consumo</Button><Button variant="outline" onClick={()=>open('payment')} permission="reservations.collect"><Wallet size={16}/> Cobro de estadía</Button><Button variant="outline" onClick={()=>setPage('Compras y gastos')}><Receipt size={16}/> Gasto</Button><Button variant="outline" onClick={()=>setPage('Compras y gastos')}><Package size={16}/> Compra</Button></section></>;}
