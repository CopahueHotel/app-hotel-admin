'use client';

import { Field,type EntryForm } from '@/modules/shared/hotel-ui';
export function SettingsFields({form}:{form:EntryForm}){return <Field label="Precio por persona (ARS)" name="mealPrice" type="number" min="0" step="0.01" value={form.mealPrice}/>;}
