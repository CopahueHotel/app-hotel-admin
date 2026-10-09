'use client';

import type { HotelData } from '@/lib/hotel-types';
import type { EntryForm } from '@/modules/shared/hotel-ui';

import { currency } from '@/lib/hotel-view';
import { ActionButton as Button } from '@/modules/access/context';
import { DataTable,Status } from '@/modules/shared/hotel-ui';
type Props={
open:(action:string,initial?:Omit<EntryForm,'action'>)=>void;
mealPrice:number;
rooms:HotelData['rooms']};
export function SettingsScreen({open,mealPrice,rooms}:Props){return <><section className="panel"><div className="panel-heading"><div><h2>Restaurante</h2><p>Menú fijo · precio por persona</p></div><Button variant="outline" onClick={()=>open('settings',{mealPrice:mealPrice/100})} permission="settings.configure">Definir precio</Button></div><div className="config-row"><span>Comida para clientes externos</span><strong>{mealPrice?currency(mealPrice):'Pendiente de definir'}</strong></div><div className="config-row"><span>Regímenes de estadía</span><strong>Desayuno · MP · PC</strong></div><div className="config-row"><span>Media pensión</span><strong>Almuerzo o cena · elección por día</strong></div></section><section className="panel spaced"><div className="panel-heading"><h2>Habitaciones · {rooms.length} utilizables</h2></div><DataTable heads={['Número','Tipo','Estado','Observación','']} rows={rooms.map((r)=>[r.id,r.type,<Status key="cell-9" value={r.state}/>,r.note||'—',<Button key="cell-10" variant="outline" size="sm" onClick={()=>open('room',r)} permission="rooms.edit">Actualizar</Button>])}/></section></>;}
