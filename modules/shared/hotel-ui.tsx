'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from '@/components/ui/table';
import type { Booking,BookingTerms,Rate } from '@/lib/hotel-types';
import { useState,type ComponentProps,type ReactNode } from 'react';
export type EntryForm={bookingRecord?:Booking;terms?:BookingTerms;rate?:Rate;version?:number;action:string;id?:string|number;booking?:string;charge?:boolean;room?:number;start?:string;end?:string;amount?:number;product?:string;state?:string;note?:string;meal?:string;mealPrice?:number};
export const shift=(s:string,n:number)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const fmt=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'short'});
export const sum=<T,>(a:T[],fn:(x:T)=>number)=>a.reduce((s,x)=>s+fn(x),0);
export function Pick({name,options,value,defaultValue,onChange}:{name?:string,options:string[][],value?:string,defaultValue?:string,onChange?:(v:string)=>void}){const [v,set]=useState(defaultValue??options[0]?.[0]??'');const current=value??v;return <><Select value={current} onValueChange={x=>{set(x);onChange?.(x)}}><SelectTrigger className="control"><SelectValue/></SelectTrigger><SelectContent>{options.filter(x=>x[0]!=='').map(x=><SelectItem key={x[0]} value={String(x[0])}>{x[1]}</SelectItem>)}</SelectContent></Select>{name&&<input type="hidden" name={name} value={current}/>}</>}
export function Field({label,name,type='text',value,required=true,step,min,...props}:Omit<ComponentProps<typeof Input>,'value'> & {label:string;value?:string|number}){return <label className="field"><span>{label}</span><Input className="control" name={name} type={type} defaultValue={value} required={required} step={step} min={min} {...props}/></label>}
export function Choice({label,...props}:ComponentProps<typeof Pick> & {label:string}){return <label className="field"><span>{label}</span><Pick {...props}/></label>}
export function Tick({name,label,initial=false}:{name:string;label:string;initial?:boolean}){const[v,set]=useState(initial);return <label className="tick"><Checkbox checked={v} onCheckedChange={x=>set(x===true)}/><input name={name} type="hidden" value={String(v)}/>{label}</label>}
export function DataTable({heads,rows,empty='No hay registros para mostrar.'}:{heads:string[];rows:ReactNode[][];empty?:string}){return <div className="table-wrap"><Table><TableHeader><TableRow>{heads.map((h:string)=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length?rows.map((r:ReactNode[],i:number)=><TableRow key={i}>{r.map((c,j)=><TableCell key={j}>{c}</TableCell>)}</TableRow>):<TableRow><TableCell colSpan={heads.length} className="empty-cell">{empty}</TableCell></TableRow>}</TableBody></Table></div>}
export function Status({value}:{value:string}){return <span className={'tag '+(value==='Alojado'||value==='Limpia'?'green':value==='Cancelada'||value==='Fuera de servicio'?'red':value==='Finalizada'?'gray':'blue')}>{value}</span>}
