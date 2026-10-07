import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from './helpers/hotel-fixture.mjs';
const require=createRequire(import.meta.url);
test('kitchen and reservation rendering expose per-person conditions, exact totals, suspensions, export and departures',async t=>{
 const f=await fixture(t);
 const b=await f.one("SELECT * FROM bookings WHERE id='demo-1'");
 await f.post('guestProfile',{guest:b.id+':person:1',version:0,name:'Ana de prueba',restrictions:'Celiaquía declarada',preferences:'Frutas',responsible:'Recepción',observation:'Confirmar con la persona'});
 await f.post('mealSuspend',{booking:b.id,guests:[b.id+':person:2'],start:'2026-10-04',end:'2026-10-04',service:'Cena',active:true,reason:'Excursión',responsible:'Recepción'});
 await f.post('mealPlan',{customer:'Grupo explícito',date:'2026-10-04',service:'Cena',qty:3,responsible:'Recepción'});
 const data=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const exports={},code=ts.transpileModule(readFileSync('components/hotel-meals.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>{
  if(name==='@/lib/hotel-meals')return f.load('lib/hotel-meals.ts');
  if(name==='@/lib/hotel-view')return f.load('lib/hotel-view.ts');
  if(name==='@/components/ui/button')return {Button:props=>{const attrs={...props};delete attrs.variant;return React.createElement('button',attrs);}};
  if(name==='@/components/ui/input')return {Input:props=>React.createElement('input',props)};
  return require(name);
 },exports);
 const html=renderToStaticMarkup(React.createElement(exports.Kitchen,{data,date:'2026-10-04',onSave:async()=>{}}));
 assert.ok(!html.includes('?'),'Kitchen text and audit labels must preserve Spanish characters');
 for(const label of ['Ana de prueba','Celiaquía declarada','Preferencias:','Frutas','Suspendida: Excursión','Grupo explícito','Clientes externos','Total general','Exportar listado CSV','Registrar servicio','Reactivar']){
  assert.ok(html.includes(label),label);
 }
 const totals=f.load('lib/hotel-meals.ts').kitchenTotals(f.load('lib/hotel-meals.ts').kitchenRows(data,'2026-10-04','Cena'));assert.equal(totals.external,3);assert.equal(totals.total,totals.hotel+totals.external);
 const detail=renderToStaticMarkup(React.createElement(exports.GuestMeals,{booking:b,data,date:'2026-10-04',onSave:async()=>{}}));assert.ok(detail.includes('salida excluida'));assert.ok(detail.includes('Persona 2 · nombre pendiente'));assert.ok(detail.includes('Historial de alimentación'));
 const departures=renderToStaticMarkup(React.createElement(exports.Departures,{data,date:'2026-10-04',onSelect:()=>{}}));assert.ok(departures.includes('Sale mañana'));assert.ok(departures.includes('Sale hoy'));
});
