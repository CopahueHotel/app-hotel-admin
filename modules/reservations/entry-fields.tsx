'use client';

import { SessionResponsible } from '@/modules/access/context';
import { Choice,Field,type EntryForm } from '@/modules/shared/hotel-ui';
export function BarterFields({form,termsFor}:{form:EntryForm;termsFor:(id: string) => { booking: string; base_amount: number; tariff_total: number | null; discount_amount: number; discount_type: string; discount_value: number; price_mode: string; snapshot: string; payment_condition: string; benefit: string; reason: string; responsible: string; observation: string; barter_agreement: string; barter_status: string; version: number; } | undefined}){return <><input name="booking" type="hidden" value={form.booking}/><input name="version" type="hidden" value={form.version}/><Choice label="Estado del canje" name="status" defaultValue={termsFor(form.booking??'')?.barter_status} options={['Pendiente','Parcial','Cumplido'].map(s=>[s,s])}/><Field label="Qué se cumplió / observación" name="observation"/><SessionResponsible/></>;}
