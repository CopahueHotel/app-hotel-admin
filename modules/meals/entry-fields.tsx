'use client';

import { Choice,Field,type EntryForm } from '@/modules/shared/hotel-ui';
export function MealFields({form,date}:{form:EntryForm;date:string}){return <><input type="hidden" name="booking" value={form.booking}/><Field label="Día" name="date" type="date" value={date}/><Choice label="Comida elegida" name="meal" defaultValue={form.meal} options={['Cena','Almuerzo'].map(x=>[x,x])}/></>;}
