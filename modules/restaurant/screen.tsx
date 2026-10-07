'use client';

import type { HotelData } from '@/lib/hotel-types';

import { Kitchen } from '@/components/hotel-meals';
import { Beverages } from '@/components/hotel-supply';
import { dispatchStatus } from '@/lib/hotel-supply-view';
import { currency } from '@/lib/hotel-view';
import { Allowed } from '@/modules/access/context';
import { DataTable } from '@/modules/shared/hotel-ui';
type Props={data:HotelData;
date:string;
saveMeals:(action:string,values:unknown)=>Promise<void>;
sales:{ date: string; id: string; account: string | null; amount: number; kind: string; label: string; booking: string | null; customer: string; qty: number; service: string | null; product: string | null; }[]};
export function RestaurantScreen({data,date,saveMeals,sales}:Props){return <><Allowed permission="restaurant.prices"><Beverages data={data} date={date} onSave={saveMeals}/></Allowed><Kitchen data={data} date={date} onSave={saveMeals}/><Allowed permission="restaurant.prices"><section className="panel spaced"><div className="panel-heading"><h2>Consumos registrados (independientes de la previsión)</h2></div><DataTable heads={['Cliente','Detalle','Cantidad','Importe','Tratamiento']} rows={sales.filter(s=>s.date===date).map(s=>[s.customer,s.label,s.qty,currency(s.amount),s.kind==='Incluida'?'Incluido en régimen':s.amount===0?s.kind:s.booking&&s.account===null?'Cargo a estadía':data.beverage_dispatches.some(d=>d.sale===s.id)?dispatchStatus(data,s.id):s.account])}/></section></Allowed></>;}
