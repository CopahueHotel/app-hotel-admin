'use client';

import { currentRegimes,regimeLabel } from '@/modules/shared/regimes';
import { Input } from '@/components/ui/input';
import type { HotelData,Rate } from '@/lib/hotel-types';
import { currency } from '@/lib/hotel-view';
import { ActionButton as Button,SessionResponsible } from '@/modules/access/context';
import { NumberField,TextField } from '@/modules/shared/fields';

export function RateTable({rates,date}:{rates:Rate[];date:string}) {
 return <div className="reservation-section"><h3>Tarifas al {date} · ARS por habitación y noche</h3><div className="table-wrap"><table className="reservation-table"><thead><tr><th>Tipo</th>{currentRegimes.map(regime=><th key={regime}>{regimeLabel(regime)}</th>)}</tr></thead><tbody>{['Single','Doble'].map(type=><tr key={type}><th>{type}</th>{currentRegimes.map(regime=>{const rate=rates.find(r=>r.type===type&&r.regime===regime&&r.start<=date&&date<=r.end);return <td key={regime}>{rate?currency(rate.amount):'Sin tarifa'}</td>})}</tr>)}</tbody></table></div><p className="muted">Vigencia desde y hasta inclusive. Cada noche usa la tarifa vigente de su fecha.</p></div>;
}
export function RateFields({rate,date}:{rate?:Rate;date:string}) {
 return <><input type="hidden" name="id" value={rate?.id??''}/><input type="hidden" name="version" value={rate?.version??0}/>
  <label className="field"><span>Tipo de habitación</span><select className="control" name="type" defaultValue={rate?.type??'Doble'}><option>Single</option><option>Doble</option></select></label>
  <label className="field"><span>Régimen</span><select className="control" name="regime" defaultValue={rate?.regime??'Desayuno'}>{currentRegimes.map(regime=><option key={regime} value={regime}>{regimeLabel(regime)}</option>)}{rate?.regime==='PC'&&<option value="PC">{regimeLabel('PC')}</option>}</select></label>
  <label className="field"><span>Desde (inclusive)</span><Input name="start" type="date" defaultValue={rate?.start??date} required/></label>
  <label className="field"><span>Hasta (inclusive)</span><Input name="end" type="date" defaultValue={rate?.end??date} required/></label>
  <NumberField label="ARS por habitación y noche" name="amount" value={rate?rate.amount/100:undefined}/>
  <SessionResponsible/>
  <TextField label="Observación de tarifa" name="note" value={rate?.note}/>
 </>;
}
export function RatesPanel({data,date,onOpen}:{data:HotelData;date:string;onOpen:(rate?:Rate)=>void}) {
 return <section className="panel spaced"><div className="panel-heading"><h2>Tarifas de alojamiento</h2><Button variant="outline" onClick={()=>onOpen()} permission="tariffs.create">Nueva tarifa</Button></div><RateTable rates={data.room_rates} date={date}/><div className="table-wrap"><table className="reservation-table"><thead><tr><th>Tipo / régimen</th><th>Vigencia inclusive</th><th>ARS / habitación / noche</th><th>Responsable</th><th>Acción</th></tr></thead><tbody>{data.room_rates.map(r=><tr key={r.id}><td>{r.type} · {regimeLabel(r.regime)}</td><td>{r.start} — {r.end}</td><td>{currency(r.amount)}</td><td>{r.responsible}</td><td><Button variant="outline" onClick={()=>onOpen(r)} permission="tariffs.edit">Editar</Button></td></tr>)}</tbody></table></div></section>;
}
