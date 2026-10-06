import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from './helpers/hotel-fixture.mjs';

const require=createRequire(import.meta.url);
function ui(f){
 const exports={};
 const code=ts.transpileModule(readFileSync('components/hotel-reservations.tsx','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
 }).outputText;
 new Function('require','exports',code)(name=>{
  if(name==='@/lib/hotel-view')return f.load('lib/hotel-view.ts');
  if(name==='@/lib/hotel-reservations')return f.load('lib/hotel-reservations.ts');
  // Keep application rendering real, substituting only the visual primitives.
  if(name==='@/components/ui/button')return {Button:props=>{const attrs={...props};delete attrs.variant;return React.createElement('button',attrs)}};
  if(name==='@/components/ui/input')return {Input:props=>React.createElement('input',props)};
  return require(name);
 },exports);
 return exports;
}
test('reservation form shows rate units, missing nights and independent economic fields',async t=>{
 const f=await fixture(t),data=await (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const components=ui(f),html=renderToStaticMarkup(React.createElement(components.ReservationFields,{data,date:'2026-11-01',initial:{room:2,start:'2026-11-01',end:'2026-11-03'}}));
 for(const name of ['room','start','end','priceMode','discountType','discountValue','paymentCondition','benefit','reason','responsible','quoteSnapshot'])assert.ok(html.includes(`name="${name}"`),name);
 assert.ok(html.includes('ARS por habitación y noche'));
 assert.ok(html.includes('Sin tarifa para:'));
 assert.ok(html.includes('2026-11-02'));
 assert.ok(html.includes('Salida excluida'));
 assert.ok(!html.includes('name="paid"'));
 const table=renderToStaticMarkup(React.createElement(components.RateTable,{rates:[],date:'2026-11-01'}));
 assert.equal((table.match(/Sin tarifa/g)||[]).length,6);
});
test('historical economic detail preserves price and explains monetary balance without invented tariff history',async t=>{
 const f=await fixture(t),data=await (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const components=ui(f),booking=data.bookings.find(b=>b.id==='demo-1');
 const html=renderToStaticMarkup(React.createElement(components.EconomicDetail,{data,booking,onBarter:()=>{}}));
 for(const text of ['Precio base','Descuento','Alojamiento acordado','Consumos a estadía','Consumos ya pagados','Cobros de estadía','Saldo monetario','Importe histórico conservado'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('300.000,00'));
 assert.ok(html.includes('200.000,00'));
});
