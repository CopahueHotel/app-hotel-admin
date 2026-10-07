import { loadUi } from './helpers/hotel-ui.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';



import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from './helpers/hotel-fixture.mjs';

test('beverage and supplier screens expose destinations, separate stock/payment actions, due filters and historical meaning',async t=>{
 const f=await fixture(t),date='2026-10-03',who={responsible:'Operador de prueba',observation:'Conservar observación'};
 assert.equal((await f.post('beverageAccount',{date,time:'12:00',table:'Mesa 7',...who})).status,200);
 const a=await f.one('SELECT * FROM beverage_accounts');
 await f.post('beverageDispatch',{date,time:'13:25',product:'agua',qty:2,price:12.34,destination:'Mesa',tableAccount:a.id,mode:'Pendiente',customer:'Mesa 7',account:'Banco',...who});
 await f.post('purchaseDocument',{date,due:'',supplier:'Proveedor de prueba',label:'Bebidas para recibir',invoice:'TEST-1',area:'Hotel',kind:'Variable',type:'Productos',category:'Productos',lines:[{product:'agua',category:'Bebidas',qty:4,cost:12.34}],...who});
 const data=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const exports=loadUi(f,'components/hotel-supply.tsx');
 const beverage=renderToStaticMarkup(React.createElement(exports.Beverages,{data,date,onSave:async()=>{}}));
 for(const label of ['Mesa 7','13:25','Pendiente de cobro','Despachar bebida','Cobrar / transferir','Devolución física','Corregir','Conservar observación','Historial de movimientos'])assert.ok(beverage.includes(label),label);
 const purchase=renderToStaticMarkup(React.createElement(exports.Purchases,{data,date,onSave:async()=>{}}));
 for(const label of ['Vencimiento sin definir','Proveedor de prueba','Bebidas para recibir','TEST-1','Pendiente / parcial','Pagar','Recibir','Exportar proveedores CSV','Histórico','Parcialmente pagado','Actividad','Rubro','Vencido','Sin vencimiento'])assert.ok(purchase.includes(label),label);
 assert.ok(!beverage.includes('?')&&!purchase.includes('?'),'Spanish labels must preserve accents');
});
