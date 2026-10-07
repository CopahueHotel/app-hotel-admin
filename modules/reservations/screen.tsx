'use client';

import type { Booking } from '@/lib/hotel-types';
import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { ActionButton as Button } from '@/modules/access/context';
import { DataTable } from '@/modules/shared/hotel-ui';
import { Download,Search } from 'lucide-react';
import type { Dispatch,SetStateAction } from 'react';
type Props={bookings:Booking[];
search:string;
setSearch:Dispatch<SetStateAction<string>>;
exportCsv:() => void;
guestRows:(list:Booking[])=>ReactNode[][];
filteredBookings:Booking[]};
export function ReservationsScreen({bookings,search,setSearch,exportCsv,guestRows,filteredBookings}:Props){return <section className="panel"><div className="panel-heading"><h2>{bookings.length} reservas</h2><div className="inline-controls"><div className="search-control"><Search size={16}/><Input placeholder="Buscar huésped o habitación" aria-label="Buscar reserva" value={search} onChange={e=>setSearch(e.target.value)}/></div><Button variant="outline" onClick={exportCsv} permission="reservations.export"><Download size={16}/> Exportar</Button></div></div><DataTable heads={['Huésped','Estadía','Régimen','Estado','Saldo']} rows={guestRows(filteredBookings)}/></section>;}
