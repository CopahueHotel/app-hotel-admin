'use client';

import type { HotelData } from '@/lib/hotel-types';
import { SessionResponsible } from '@/modules/access/context';
import { Choice,Field,shift,type EntryForm } from '@/modules/shared/hotel-ui';


export function BlockFields({rooms,date}:{rooms:HotelData['rooms'];date:string}){return <><Choice label="Habitación" name="room" options={rooms.map(r=>[String(r.id),String(r.id)+' · '+r.type])}/><Field label="Desde incluido" name="start" type="date" value={date}/><Field label="Hasta excluido" name="end" type="date" value={shift(date,1)}/><Field label="Motivo de mantenimiento" name="reason"/><SessionResponsible/></>;}

export function UnblockFields({form}:{form:EntryForm}){return <><input name="id" type="hidden" value={form.id}/><Field label="Motivo de liberación" name="reason"/><SessionResponsible/></>;}

export function RoomFields({form}:{form:EntryForm}){return <><input name="room" type="hidden" value={form.id}/><Choice label={`Habitación ${form.id}`} name="state" defaultValue={form.state} options={['Limpia','Pendiente de limpieza','Fuera de servicio'].map(x=>[x,x])}/><Field label="Observación / mantenimiento" name="note" value={form.note} required={false}/></>;}
