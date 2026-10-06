'use client';
import { useState } from 'react';
import type { Booking, BookingTerms, HotelData, Rate } from '@/lib/hotel-types';
import { currency, bookingBalance } from '@/lib/hotel-view';
import { quoteStay, discountCents } from '@/lib/hotel-reservations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function RateTable({rates,date}:{rates:Rate[];date:string}) {
 return <div className="reservation-section"><h3>Tarifas al {date} · ARS por habitación y noche</h3><div className="table-wrap"><table className="reservation-table"><thead><tr><th>Tipo</th><th>Desayuno</th><th>Media pensión</th><th>Pensión completa</th></tr></thead><tbody>{['Single','Doble'].map(type=><tr key={type}><th>{type}</th>{['Desayuno','MP','PC'].map(regime=>{const rate=rates.find(r=>r.type===type&&r.regime===regime&&r.start<=date&&date<=r.end);return <td key={regime}>{rate?currency(rate.amount):'Sin tarifa'}</td>})}</tr>)}</tbody></table></div><p className="muted">Vigencia desde y hasta inclusive. Cada noche usa la tarifa vigente de su fecha.</p></div>;
}
function NumberField({label,name,value,required=true}:{label:string;name:string;value?:number;required?:boolean}) {
 return <label className="field"><span>{label}</span><Input name={name} type="number" min="0" step="0.01" defaultValue={value} required={required}/></label>;
}
function TextField({label,name,value='',required=false}:{label:string;name:string;value?:string;required?:boolean}) {
 return <label className="field"><span>{label}</span><Input name={name} defaultValue={value} required={required} maxLength={name==='responsible'?240:1000}/></label>;
}
export function ReservationFields({data,date,initial,booking,terms}:{data:HotelData;date:string;initial:{room?:number;start?:string;end?:string};booking?:Booking;terms?:BookingTerms}) {
 const [room,setRoom]=useState(String(booking?.room??initial.room??data.rooms.find(r=>r.state!=='Fuera de servicio')?.id??''));
 const [start,setStart]=useState(booking?.start??initial.start??date),[end,setEnd]=useState(booking?.end??initial.end??new Date(Date.parse(date)+86400000).toISOString().slice(0,10));
 const [regime,setRegime]=useState(booking?.regime??'Desayuno');
 const [mode,setMode]=useState(booking?'Conservar':'Tarifa'),[benefit,setBenefit]=useState(terms?.benefit??'Habitual');
 const [gross,setGross]=useState(String((terms?.base_amount??booking?.amount??0)/100));
 const [discountType,setDiscountType]=useState(terms?.discount_type??'Ninguno'),[discountValue,setDiscountValue]=useState(String((terms?.discount_value??0)/100));
 const roomType=data.rooms.find(r=>r.id===Number(room))?.type??'';
 const quote=quoteStay(data.room_rates,roomType,regime,start,end);
 const unavailable=data.bookings.some(b=>b.id!==booking?.id&&b.status!=='Cancelada'&&b.room===Number(room)&&b.start<end&&b.end>start)
  ||data.room_blocks.some(b=>b.active&&b.room===Number(room)&&b.start<end&&b.end>start);
 const base=mode==='Conservar'?(terms?.base_amount??booking?.amount??0):mode==='Tarifa'?(quote.total??0):Math.round(Number(gross)*100);
 let discount=0,error='';
 try{discount=discountCents(base,discountType,Number(discountValue),benefit)}catch(cause){error=cause instanceof Error?cause.message:'Revisá el descuento.'}
 const special=mode==='Acordado'||benefit!=='Habitual'||discount>0;
 return <>
  <input type="hidden" name="quoteSnapshot" value={JSON.stringify(quote.nights)}/>
  {booking&&<><input type="hidden" name="id" value={booking.id}/><input type="hidden" name="version" value={terms?.version??0}/></>}
  <TextField label="Nombre y apellido" name="guest" value={booking?.guest} required/>
  <TextField label="Teléfono" name="phone" value={booking?.phone}/>
  <label className="field"><span>Habitación</span><select className="control" name="room" value={room} onChange={e=>setRoom(e.target.value)} required>{data.rooms.filter(r=>r.state!=='Fuera de servicio').map(r=><option key={r.id} value={r.id}>{r.id} · {r.type}</option>)}</select></label>
  <label className="field"><span>Personas</span><Input name="pax" type="number" min="1" max={roomType==='Single'?1:2} defaultValue={booking?.pax??1} required/></label>
  <label className="field"><span>Llegada incluida</span><Input name="start" type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label>
  <label className="field"><span>Salida excluida</span><Input name="end" type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)} required/></label>
  <label className="field"><span>Régimen</span><select className="control" name="regime" value={regime} onChange={e=>setRegime(e.target.value)}><option>Desayuno</option><option value="MP">Media pensión</option><option value="PC">Pensión completa</option></select></label>
  <label className="field"><span>Comida para MP</span><select className="control" name="meal" defaultValue={booking?.meal??'Cena'}><option>Cena</option><option>Almuerzo</option></select></label>
  <TextField label="Origen" name="source" value={booking?.source??'Directa'} required/>
  <TextField label="Observaciones de reserva" name="note" value={booking?.note}/>
  <div className="full-width"><RateTable rates={data.room_rates} date={start||date}/></div>
  <label className="field"><span>Precio de alojamiento</span><select className="control" name="priceMode" value={mode} onChange={e=>setMode(e.target.value)}>{booking&&<option value="Conservar">Conservar precio y detalle guardados</option>}<option value="Tarifa">Calcular por tarifas de cada noche</option><option value="Acordado">Precio acordado antes de descuentos</option></select></label>
  {mode==='Acordado'&&<label className="field"><span>Alojamiento acordado antes del descuento (ARS)</span><Input name="amount" type="number" min="0" step="0.01" value={gross} onChange={e=>setGross(e.target.value)} required/></label>}
  <label className="field"><span>Beneficio / carácter especial</span><select className="control" name="benefit" value={benefit} onChange={e=>setBenefit(e.target.value)}>{['Habitual','Descuento','Amigo','Canje','Cortesía'].map(b=><option key={b}>{b}</option>)}</select></label>
  <label className="field"><span>Tipo de descuento</span><select className="control" name="discountType" value={benefit==='Cortesía'?'Porcentaje':discountType} disabled={benefit==='Cortesía'||mode==='Conservar'} onChange={e=>{setDiscountType(e.target.value);setDiscountValue('0')}}>{['Ninguno','Importe','Porcentaje'].map(t=><option key={t}>{t}</option>)}</select>{(benefit==='Cortesía'||mode==='Conservar')&&<input type="hidden" name="discountType" value={benefit==='Cortesía'?'Porcentaje':discountType}/>}</label>
  <label className="field"><span>{discountType==='Porcentaje'?'Descuento (%)':'Descuento (ARS)'}</span><Input name="discountValue" type="number" min="0" max={discountType==='Porcentaje'?100:undefined} step="0.01" value={benefit==='Cortesía'?'100':discountValue} readOnly={benefit==='Cortesía'||discountType==='Ninguno'||mode==='Conservar'} onChange={e=>setDiscountValue(e.target.value)} required/></label>
  <label className="field"><span>Condición de pago (no registra dinero)</span><Input name="paymentCondition" defaultValue={terms?.payment_condition??'Seña y saldo al ingreso'} list="payment-conditions" maxLength={240} required/><datalist id="payment-conditions"><option value="Seña y saldo al ingreso"/><option value="Pago al egreso"/><option value="Pago anticipado"/></datalist></label>
  <TextField label="Motivo del precio o beneficio especial" name="reason" value={terms?.reason} required={special}/>
  <TextField label="Responsable declarado (acceso compartido)" name="responsible" value={terms?.responsible} required={special}/>
  <TextField label="Observación económica" name="observation" value={terms?.observation}/>
  {benefit==='Canje'&&<TextField label="Qué se acordó en el canje" name="barterAgreement" value={terms?.barter_agreement} required/>}
  <div className="full-width reservation-section" aria-live="polite"><h3>Detalle de alojamiento</h3>
   {unavailable&&<p role="alert">Habitación no disponible para todas esas noches: reserva o mantenimiento.</p>}
   {mode==='Conservar'?<p>Se conserva el detalle original. Cambiar fechas, habitación o régimen requiere elegir tarifas o un nuevo precio acordado.</p>:<>
    {(!quote.nights.length||quote.nights.length>365)&&<p role="alert">Elegí una llegada anterior a la salida, hasta 365 noches.</p>}
    {quote.missing.length>0&&<p role="alert">Sin tarifa para: {quote.missing.join(', ')}. Elegí precio acordado y explicá el acuerdo.</p>}
    <details><summary>{quote.nights.length} noches · ver precios por noche</summary><ul>{quote.nights.map(n=><li key={n.date}>{n.date}: {n.amount===null?'Sin tarifa':currency(n.amount)}</li>)}</ul></details>
   </>}
   <p>Base: <strong>{currency(base)}</strong> · Descuento: <strong>{currency(discount)}</strong> · Alojamiento: <strong>{currency(base-discount)}</strong></p>
   {error&&<p role="alert">{error}</p>}
   {benefit==='Amigo'&&<p>Amigo identifica la condición; cualquier descuento debe cargarse expresamente.</p>}
   {benefit==='Canje'&&<p>El canje no genera cobros de dinero. Un acuerdo nuevo queda pendiente; su cumplimiento se registra desde la ficha.</p>}
  </div>
 </>;
}
export function RateFields({rate,date}:{rate?:Rate;date:string}) {
 return <><input type="hidden" name="id" value={rate?.id??''}/><input type="hidden" name="version" value={rate?.version??0}/>
  <label className="field"><span>Tipo de habitación</span><select className="control" name="type" defaultValue={rate?.type??'Doble'}><option>Single</option><option>Doble</option></select></label>
  <label className="field"><span>Régimen</span><select className="control" name="regime" defaultValue={rate?.regime??'Desayuno'}><option>Desayuno</option><option>MP</option><option>PC</option></select></label>
  <label className="field"><span>Desde (inclusive)</span><Input name="start" type="date" defaultValue={rate?.start??date} required/></label>
  <label className="field"><span>Hasta (inclusive)</span><Input name="end" type="date" defaultValue={rate?.end??date} required/></label>
  <NumberField label="ARS por habitación y noche" name="amount" value={rate?rate.amount/100:undefined}/>
  <TextField label="Responsable declarado" name="responsible" value={rate?.responsible} required/>
  <TextField label="Observación de tarifa" name="note" value={rate?.note}/>
 </>;
}
export function RatesPanel({data,date,onOpen}:{data:HotelData;date:string;onOpen:(rate?:Rate)=>void}) {
 return <section className="panel spaced"><div className="panel-heading"><h2>Tarifas de alojamiento</h2><Button variant="outline" onClick={()=>onOpen()}>Nueva tarifa</Button></div><RateTable rates={data.room_rates} date={date}/><div className="table-wrap"><table className="reservation-table"><thead><tr><th>Tipo / régimen</th><th>Vigencia inclusive</th><th>ARS / habitación / noche</th><th>Responsable</th><th>Acción</th></tr></thead><tbody>{data.room_rates.map(r=><tr key={r.id}><td>{r.type} · {r.regime}</td><td>{r.start} — {r.end}</td><td>{currency(r.amount)}</td><td>{r.responsible}</td><td><Button variant="outline" onClick={()=>onOpen(r)}>Editar</Button></td></tr>)}</tbody></table></div></section>;
}
export function MaintenancePanel({data,onCreate,onRelease}:{data:HotelData;onCreate:()=>void;onRelease:(id:string)=>void}) {
 return <section className="panel spaced"><div className="panel-heading"><h2>Bloqueos por mantenimiento</h2><Button variant="outline" onClick={onCreate}>Bloquear noches</Button></div><p className="reservation-section muted">Desde incluido, hasta excluido. Un bloqueo no desplaza reservas existentes y conserva su historial al liberarse.</p><div className="table-wrap"><table className="reservation-table"><thead><tr><th>Habitación</th><th>Desde / hasta</th><th>Motivo</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>{data.room_blocks.map(b=><tr key={b.id}><td>{b.room}</td><td>{b.start} — {b.end}</td><td>{b.reason}</td><td>{b.responsible}</td><td>{b.active?<Button variant="outline" onClick={()=>onRelease(b.id)}>Bloqueado · liberar</Button>:'Liberado'}</td></tr>)}</tbody></table></div></section>;
}
export function EconomicDetail({booking,terms,data,onBarter}:{booking:Booking;terms?:BookingTerms;data:HotelData;onBarter:()=>void}) {
 const charges=data.sales.filter(s=>s.booking===booking.id&&s.account===null).reduce((s,m)=>s+m.amount,0);
 const immediate=data.sales.filter(s=>s.booking===booking.id&&s.account!==null).reduce((s,m)=>s+m.amount,0);
 const payments=data.cash_movements.filter(m=>m.ref===booking.id&&m.kind==='Cobro').reduce((s,m)=>s+m.amount,0);
 const saved=terms?JSON.parse(terms.snapshot) as ReturnType<typeof quoteStay>['nights']:[];
 const barterEvents=data.audit_log.filter(a=>a.action==='barter').sort((a,b)=>b.created.localeCompare(a.created)).map(a=>{
  const record=JSON.parse(a.detail) as {input?:{booking:string;responsible:string;observation:string;status:string}};
  return {created:a.created,...record.input};
 }).filter(e=>e.booking===booking.id);
 return <section className="reservation-section"><h3>Condiciones económicas</h3><p><strong>{terms?.benefit??'Habitual'}</strong> · {terms?.payment_condition??'Sin especificar'}</p>
  <dl className="detail-list"><dt>Precio base</dt><dd>{currency(terms?.base_amount??booking.amount)}</dd><dt>Descuento</dt><dd>{currency(terms?.discount_amount??0)}</dd><dt>Alojamiento acordado</dt><dd>{currency(booking.amount)}</dd><dt>Consumos a estadía</dt><dd>{currency(charges)}</dd><dt>Consumos ya pagados</dt><dd>{currency(immediate)} · fuera del saldo</dd><dt>Cobros de estadía</dt><dd>{currency(payments)}</dd><dt>Saldo monetario</dt><dd>{currency(bookingBalance(booking,data.sales,data.cash_movements))}</dd><dt>Motivo</dt><dd>{terms?.reason||'Sin acuerdo especial'}</dd><dt>Responsable declarado</dt><dd>{terms?.responsible||'Sin registrar (histórico)'}</dd><dt>Observación</dt><dd>{terms?.observation||'Sin observaciones'}</dd></dl>
  {saved.length?<details><summary>Precios de referencia guardados por noche</summary><ul>{saved.map(n=><li key={n.date}>{n.date} · {n.type} · {n.regime}: {n.amount===null?'Sin tarifa':currency(n.amount)}</li>)}</ul></details>:<p>Importe histórico conservado; no hay detalle tarifario reconstruido.</p>}
  {terms?.benefit==='Canje'&&<div><h3>Canje · {terms.barter_status}</h3><p>{terms.barter_agreement}</p><p>El cumplimiento del canje se registra por separado; no es un pago de dinero.</p><ul>{barterEvents.map(e=><li key={e.created}>{e.status} · {e.responsible}: {e.observation}</li>)}</ul><Button variant="outline" onClick={onBarter}>Registrar cumplimiento</Button></div>}
 </section>;
}
