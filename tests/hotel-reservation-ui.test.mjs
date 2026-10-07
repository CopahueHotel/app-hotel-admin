import assert from 'node:assert/strict';
import test from 'node:test';



import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from './helpers/hotel-fixture.mjs';

import { loadUi } from './helpers/hotel-ui.mjs';
const ui=f=>loadUi(f,'components/hotel-reservations.tsx');

test('reservation form shows rate units, missing nights and independent economic fields',async t=>{
 const f=await fixture(t),data=await (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const components=ui(f),html=renderToStaticMarkup(React.createElement(components.ReservationFields,{data,date:'2026-11-01',initial:{room:2,start:'2026-11-01',end:'2026-11-03'}}));
 for(const name of ['room','start','end','priceMode','discountType','discountValue','paymentCondition','benefit','reason','quoteSnapshot'])assert.ok(html.includes(`name="${name}"`),name);
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
