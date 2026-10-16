import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture,testPassword } from './helpers/hotel-fixture.mjs';
import { loadUi } from './helpers/hotel-ui.mjs';
const date='2026-10-03',payment={date,booking:'demo-1',amount:50000,account:'Efectivo',currency:'USD',usdAmount:50,exchangeRate:1000};
async function data(f,cookie=f.cookie){return (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:cookie}}))).json();}
async function account(f,roles){const email=crypto.randomUUID()+'@example.test';assert.equal((await f.post('userSave',{name:'Currency test',email,roles,password:testPassword,active:true})).status,200);const r=await f.auth.login(f.authRequest('/api/auth/login',{email,password:testPassword}));return r.headers.get('set-cookie').split(';')[0];}
function gate(f){let arrivals=0,release;const wait=new Promise(r=>release=r);f.setGate(async statements=>{if(!statements.some(s=>s.sql.startsWith('INSERT INTO operation_requests')))return;if(++arrivals===2)release();await wait;});}

test('USD stay receipts preserve ARS debt, original dollars, fixed rate, real actor and idempotency',async t=>{
 const f=await fixture(t),before=await data(f),helpers=f.load('modules/cash/currency.ts'),key=crypto.randomUUID();
 assert.equal((await f.post('payment',{...payment,responsible:'spoof'},key)).status,200);
 assert.equal((await f.post('payment',{...payment,responsible:'spoof'},key)).status,200);
 const after=await data(f),r=after.cash_receipts[0];assert.equal(after.cash_receipts.length,1);assert.equal(r.actor,'Test Administrator');assert.equal(r.usd_cents,5000);assert.equal(r.rate,10000000);assert.equal(r.change_ars,0);
 assert.deepEqual(helpers.cashBalances(after.cash_movements,after,date),{ars:12000000,usd:5000});
 const balance=f.load('lib/hotel-view.ts').bookingBalance,b=after.bookings.find(b=>b.id==='demo-1');assert.equal(balance(b,after.sales,after.cash_movements),balance(b,before.sales,before.cash_movements)-5000000);
 assert.equal((await f.post('payment',{...payment,usdAmount:25,amount:30000,exchangeRate:1200})).status,200);
 assert.deepEqual(await f.one('SELECT usd_cents,rate FROM cash_receipts WHERE id=?',r.id),{usd_cents:5000,rate:10000000});
 await assert.rejects(f.raw.prepare('UPDATE cash_receipts SET rate=1 WHERE id=?').bind(r.id).run(),/HOT_HISTORY_IMMUTABLE/);
});

test('USD change is explicit, affects only physical ARS cash and never becomes an extra guest payment',async t=>{
 const f=await fixture(t),count=await f.count('cash_movements');
 assert.equal((await f.post('payment',{...payment,usdAmount:100})).status,400);assert.equal(await f.count('cash_movements'),count);
 assert.equal((await f.post('payment',{...payment,usdAmount:100,confirmChange:true})).status,200);
 let d=await data(f);assert.deepEqual(f.load('modules/cash/currency.ts').cashBalances(d.cash_movements,d,date),{ars:7000000,usd:10000});
 assert.equal((await f.one("SELECT amount FROM cash_movements WHERE ref='demo-1' AND account='Efectivo'")).amount,5000000);
 assert.equal(d.cash_receipts[0].change_ars,5000000);
 const before=await f.count('cash_movements');assert.equal((await f.post('payment',{...payment,amount:1,usdAmount:1000,confirmChange:true})).status,400);assert.equal(await f.count('cash_movements'),before);
 d=await data(f);assert.equal(d.cash_receipts.length,1);
});

test('invalid USD currency, noncash destinations, underpayment, overcollection and precision are rejected atomically',async t=>{
 const f=await fixture(t),count=await f.count('cash_movements');
 for(const extra of [{currency:'EUR'},{account:'Banco'},{account:'Billetera'},{usdAmount:0},{usdAmount:1},{usdAmount:1.001},{exchangeRate:0},{exchangeRate:-1},{exchangeRate:1000.00001},{exchangeRate:undefined},{usdAmount:undefined},{amount:300000,usdAmount:300}]){
  assert.equal((await f.post('payment',{...payment,...extra})).status,400,JSON.stringify(extra));assert.equal(await f.count('cash_movements'),count);
 }
 const helper=f.load('modules/cash/currency.ts');assert.equal(helper.convertedCents(1,12345678),1235);assert.equal(helper.convertedCents(3,5000),2);
 await f.raw.prepare("INSERT INTO cash_movements VALUES ('raw-usd',?,'Efectivo',100,'Hotel','Cobro','demo-1','Raw test')").bind(date).run();
 await assert.rejects(f.raw.prepare('INSERT INTO cash_receipts VALUES (?,?,?,?,?,?,?,?)').bind('bad',date,'["raw-usd","raw-usd"]',10,10000,0,'Test','2026-10-03T00:00:00Z').run(),/HOT_USD_INVALID/);
});

test('daily closing counts ARS and USD independently, preserves USD differences and rolls back missing explanations',async t=>{
 const f=await fixture(t);await f.post('payment',payment);
 assert.equal((await f.post('close',{date,counted:120000,note:'No implicit USD count'})).status,400);
 assert.equal((await f.post('close',{date,counted:120000,countedUSD:49,note:''})).status,400);assert.equal(await f.count('daily_closes'),0);
 assert.equal((await f.post('close',{date,counted:120000,countedUSD:49,note:'USD 1 de diferencia constatada'})).status,200);
 let d=await data(f);assert.deepEqual(f.load('modules/cash/currency.ts').cashBalances(d.cash_movements,d,date),{ars:12000000,usd:4900});
 assert.equal(d.usd_closes[0].expected,5000);assert.equal(await f.count('cash_movements'),4);
 assert.equal((await f.post('payment',payment)).status,400);
 assert.equal((await f.post('close',{date:'2026-10-04',counted:120000,countedUSD:49,note:''})).status,200);
 d=await data(f);assert.equal(d.usd_closes.find(c=>c.date==='2026-10-04').expected,4900);
});

test('USD restaurant meals and immediate beverages keep ARS prices and stock with a single physical receipt',async t=>{
 const f=await fixture(t),before=(await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n;
 const sale={date,booking:'',customer:'External test',kind:'Comida',product:'',label:'Almuerzo',qty:2,price:1250,account:'Efectivo',charge:false,currency:'USD',usdAmount:5,exchangeRate:500};
 assert.equal((await f.post('sale',sale)).status,200);
 assert.equal((await f.post('sale',{...sale,charge:true,booking:'demo-1'})).status,400);
 assert.equal((await f.post('sale',{...sale,kind:'Cortesía'})).status,400);
 const dispatch={date,time:'13:00',product:'agua',qty:1,price:2500,destination:'Estadía',booking:'demo-1',customer:'Stay',mode:'Inmediato',account:'Efectivo',currency:'USD',usdAmount:5,exchangeRate:500};
 assert.equal((await f.post('beverageDispatch',dispatch)).status,200);assert.equal((await f.post('beverageDispatch',{...dispatch,mode:'Estadía'})).status,400);
 const d=await data(f);assert.equal(d.cash_receipts.length,2);assert.deepEqual(f.load('modules/cash/currency.ts').cashBalances(d.cash_movements,d,date),{ars:12000000,usd:1000});
 assert.equal((await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n,before-1);
});

test('multi-line table collection in USD counts the physical payment and change only once and never repeats stock',async t=>{
 const f=await fixture(t);await f.post('beverageAccount',{date,time:'12:00',table:'USD table'});const a=await f.one('SELECT * FROM beverage_accounts');
 const dispatch={date,time:'12:30',product:'agua',qty:1,price:2500,destination:'Mesa',tableAccount:a.id,customer:'Table',mode:'Pendiente',account:'Efectivo'};
 await f.post('beverageDispatch',dispatch);await f.post('beverageDispatch',dispatch);const stock=await f.count('stock_movements');
 const request={date,tableAccount:a.id,method:'Cobro',account:'Efectivo',currency:'USD',usdAmount:10,exchangeRate:600,confirmChange:true},key=crypto.randomUUID();
 assert.equal((await f.post('beverageSettle',request,key)).status,200);assert.equal((await f.post('beverageSettle',request,key)).status,200);
 const d=await data(f);assert.equal(d.cash_receipts.length,1);assert.equal(JSON.parse(d.cash_receipts[0].movements).length,2);assert.equal(d.cash_receipts[0].change_ars,100000);
 assert.deepEqual(f.load('modules/cash/currency.ts').cashBalances(d.cash_movements,d,date),{ars:11900000,usd:1000});assert.equal(await f.count('stock_movements'),stock);
 const rows=f.load('modules/cash/currency.ts').cashExportRows(d.cash_movements,d).slice(1);
 assert.equal(rows.reduce((sum,r)=>sum+Number(r[6]||0),0),10);assert.equal(rows.reduce((sum,r)=>sum+Number(r[8]||0),0),1000);
});

test('simultaneous USD collections cannot overcollect a stay or deliver the same available ARS change twice',async t=>{
 const f=await fixture(t);gate(f);
 const a=await Promise.all([f.post('payment',{...payment,amount:150000,usdAmount:150}),f.post('payment',{...payment,amount:150000,usdAmount:150})]);
 assert.deepEqual(a.map(r=>r.status).sort(),[200,400]);f.setGate(null);assert.equal(await f.count('cash_receipts'),1);
 const g=await fixture(t);gate(g);
 const b=await Promise.all([g.post('payment',{...payment,amount:10000,usdAmount:100,confirmChange:true}),g.post('payment',{...payment,booking:'demo-2',amount:10000,usdAmount:100,confirmChange:true})]);
 assert.deepEqual(b.map(r=>r.status).sort(),[200,400]);g.setGate(null);assert.equal(await g.count('cash_receipts'),1);
});

test('currency details respect role scopes: kitchen and stock receive none, reception sees only stay receipts',async t=>{
 const f=await fixture(t);await f.post('payment',payment);
 for(const role of ['kitchen','supply']){const d=await data(f,await account(f,[role]));assert.deepEqual(d.cash_receipts,[]);assert.deepEqual(d.usd_closes,[]);}
 const cookie=await account(f,['reception']),d=await data(f,cookie);assert.equal(d.cash_receipts.length,1);assert.deepEqual(d.usd_closes,[]);assert.ok(d.cash_movements.every(m=>m.kind==='Cobro'));
 const r=await f.api.POST(f.authRequest('/api/hotel',{action:'payment',data:payment},{Cookie:cookie,'Idempotency-Key':crypto.randomUUID()}));assert.equal(r.status,403);
});

test('a simultaneous close and USD receipt cannot silently lose dollars or record a payment in a closed day',async t=>{
 const f=await fixture(t);gate(f);
 const results=await Promise.all([f.post('payment',payment),f.post('close',{date,counted:120000,countedUSD:0,note:''})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);f.setGate(null);
 const d=await data(f);assert.equal(d.cash_receipts.length+d.usd_closes.length,1);
 assert.equal(d.cash_movements.filter(m=>m.kind==='Cobro'&&m.account==='Efectivo').length,d.cash_receipts.length);
});

test('currency migration preserves every historical row, without assigning USD or changing old closes',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0015').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 db.exec("INSERT INTO cash_movements VALUES ('opening','2026-10-01','Efectivo',123456,'Compartido','Saldo inicial','','Old cash'); INSERT INTO daily_closes VALUES ('2026-10-01',123456,123456,'','Historical actor','2026-10-01T20:00:00Z');");
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name),before=Object.fromEntries(tables.map(n=>[n,db.prepare('SELECT * FROM '+n).all()]));
 db.exec(readFileSync('drizzle/0015_mysterious_meggan.sql','utf8'));for(const n of tables)assert.deepEqual(db.prepare('SELECT * FROM '+n).all(),before[n],n);assert.equal(db.prepare('SELECT count(*) n FROM cash_receipts').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM usd_closes').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('cash and collection screens explain physical currencies, ARS applied, explicit rate and separate closing',async t=>{
 const f=await fixture(t);await f.post('payment',payment);const d=await data(f),noop=()=>{};
 const cash=loadUi(f,'modules/cash/screen.tsx').CashScreen,html=renderToStaticMarkup(React.createElement(cash,{data:d,date,cash:d.cash_movements,accounts:['Efectivo','Banco','Billetera'],open:noop,exportCsv:noop,area:'Todo',setArea:noop,filteredCash:d.cash_movements}));
 for(const label of ['Efectivo · USD','Efectivo · ARS','recibidos','sin convertir a ARS','Cierres de efectivo · USD'])assert.ok(html.includes(label),label);
 const fields=loadUi(f,'modules/cash/entry-fields.tsx'),form=renderToStaticMarkup(React.createElement(fields.PaymentFields,{form:{action:'payment',booking:'demo-1',amount:100},choiceBookings:[['demo-1','Guest']],accountOpts:[['Efectivo','Efectivo']]}));assert.match(form,/Moneda del cobro/);assert.match(form,/USD/);
 const close=renderToStaticMarkup(React.createElement(fields.CloseFields,{data:d,date,cash:d.cash_movements}));assert.match(close,/countedUSD/);assert.match(close,/Contá ambas monedas por separado/);
});
