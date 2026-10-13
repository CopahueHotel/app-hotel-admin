'use client';
import { useEffect,useState } from 'react';
import { Input } from '@/components/ui/input';
import { ActionButton as Button,useIdentity } from '@/modules/access/context';
import { can } from '@/modules/access/permissions';
import { origins } from '@/modules/customers/domain';
import type { CustomerSummary } from '@/modules/customers/types';
export function useMatches(email:string,phone:string){
 const [matches,setMatches]=useState<{key:string;rows:CustomerSummary[]}>({key:'',rows:[]}),identity=useIdentity();
 const key=email+'\0'+phone,allowed=!identity||can(identity,'customers.lookup')||can(identity,'customers.view');
 useEffect(()=>{
  if((!email&&!phone)||!allowed)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>fetch('/api/hotel/customers?'+new URLSearchParams({lookup:'1',email,phone}),{signal:controller.signal}).then(async response=>{if(!response.ok)return;const data=await response.json() as {customers:CustomerSummary[];error?:string};setMatches({key,rows:data.customers})}).catch(()=>{}),300);
  return()=>{clearTimeout(timer);controller.abort();};
 },[email,phone,allowed,key]);
 return allowed&&matches.key===key?matches.rows:[];
}
export function Coincidences({matches,onSelect,current}:{matches:CustomerSummary[];onSelect?:(customer:CustomerSummary)=>void;current?:string}){
 const found=matches.filter(c=>c.id!==current);
 return found.length?<div className="form-note customer-wide"><strong>Posibles coincidencias · no se fusionan automáticamente</strong>{found.map(c=><div className="inline-controls" key={c.id}><span>{c.name} · {c.email||c.phone||'Sin contacto'}</span>{onSelect&&<Button type="button" variant="outline" size="sm" onClick={()=>onSelect(c)}>Seleccionar</Button>}</div>)}{!current&&<label className="tick"><input type="checkbox" name="customerDuplicate"/> Son personas distintas; crear otra ficha.</label>}</div>:null;
}
export function ReservationContact({initialId='',fallback}:{initialId?:string;fallback?:{name:string;phone:string}}){
 const identity=useIdentity(),[selected,setSelected]=useState<CustomerSummary|null>(initialId?{id:initialId,name:fallback?.name??'',phone:fallback?.phone??'',email:''}:null);
 const [search,setSearch]=useState(''),[results,setResults]=useState<CustomerSummary[]>([]),[error,setError]=useState('');
 const [name,setName]=useState(fallback?.name??''),[email,setEmail]=useState(''),[phone,setPhone]=useState(fallback?.phone??'');
 const matches=useMatches(selected?'':email,selected?'':phone);
 const lookup=!identity||can(identity,'customers.lookup')||can(identity,'customers.view'),create=!identity||can(identity,'customers.create');
 useEffect(()=>{
  if(!lookup)return;
  const controller=new AbortController(),timer=setTimeout(()=>{
   if(search.trim().length<2){setResults([]);return;}
   fetch('/api/hotel/customers?'+new URLSearchParams({lookup:search}),{signal:controller.signal}).then(async response=>{const data=await response.json() as {customers:CustomerSummary[];error?:string};if(!response.ok)throw Error(data.error);setResults(data.customers);setError('')}).catch(error=>{if(error.name!=='AbortError')setError(error.message)});
  },250);return()=>{clearTimeout(timer);controller.abort();};
 },[search,lookup]);
 useEffect(()=>{
  if(!initialId||!lookup)return;
  const controller=new AbortController();fetch('/api/hotel/customers?'+new URLSearchParams({lookup:'1',id:initialId}),{signal:controller.signal}).then(async response=>{if(response.ok){const data=await response.json() as {customers:CustomerSummary[];error?:string};if(data.customers[0])setSelected(data.customers[0]);}}).catch(()=>{});return()=>controller.abort();
 },[initialId,lookup]);
 return <div className="customer-contact customer-wide">
  <input type="hidden" name="customerId" value={selected?.id??''}/>
  <h3>Cliente titular de la reserva</h3>
  {lookup&&<label className="field"><span>Buscar cliente por nombre, email o teléfono</span><Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Escribí al menos dos caracteres"/></label>}
  {error&&<p className="notice error">{error}</p>}
  {results.length>0&&<div className="customer-search-results">{results.map(c=><Button key={c.id} variant="outline" type="button" onClick={()=>{setSelected(c);setSearch('');setResults([])}}>{c.name} · {c.email||c.phone}</Button>)}</div>}
  {selected?<><p><strong>{selected.name}</strong> · {selected.email||'Sin email'} · {selected.phone||'Sin teléfono'}</p><p className="muted">Datos centralizados en Clientes. Las condiciones y huéspedes pertenecen a esta estadía.</p><input type="hidden" name="guest" value={selected.name}/><input type="hidden" name="phone" value={selected.phone}/>{create&&<Button type="button" variant="outline" onClick={()=>{setSelected(null);setName('');setEmail('');setPhone('')}}>Crear otro cliente</Button>}</>:create?<>
   <div className="form-grid"><label className="field"><span>Nombre y apellido</span><Input name="guest" value={name} onChange={e=>setName(e.target.value)} required maxLength={240}/></label><label className="field"><span>Email (opcional)</span><Input name="customerEmail" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={240}/></label><label className="field"><span>Teléfono / WhatsApp (opcional)</span><Input name="phone" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={240}/></label>{[['Localidad','customerLocality'],['Provincia','customerProvince'],['País','customerCountry']].map(([label,field])=><label className="field" key={field}><span>{label}</span><Input name={field} maxLength={240}/></label>)}<label className="field"><span>Origen inicial del contacto</span><select className="control" name="customerOrigin" defaultValue="Otro">{origins.map(value=><option key={value}>{value}</option>)}</select></label></div>
   <Coincidences matches={matches} onSelect={setSelected}/><p className="muted">Email y teléfono pueden quedar vacíos. Reservar no autoriza comunicaciones promocionales.</p>
  </>:<p>Seleccioná un cliente existente. No tenés permiso para crear fichas.</p>}
 </div>;
}
