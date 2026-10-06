import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/hotel-fixture.mjs';
const booking={guest:'Prueba alimentación',room:2,start:'2026-11-29',end:'2026-12-02',pax:2,regime:'MP',meal:'Cena',source:'Directa',priceMode:'Acordado',amount:200,reason:'Prueba',responsible:'Gerente'};
const who={responsible:'Recepción de prueba',observation:'Detalle de prueba'};
async function create(f){assert.equal((await f.post('booking',booking)).status,200);const b=await f.one('SELECT * FROM bookings WHERE guest=?',booking.guest);return {b,guests:[b.id+':person:1',b.id+':person:2']};}
async function data(f){return (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();}
function forecast(f,d,date='2026-11-30',service='Cena'){return f.load('lib/hotel-meals.ts').kitchenRows(d,date,service).filter(r=>r.name.startsWith(booking.guest)||r.booking===d.bookings.find(b=>b.guest===booking.guest)?.id);}
const suspend=(b,guests,extra={})=>({booking:b.id,guests,start:'2026-11-30',end:'2026-11-30',service:'Cena',active:true,reason:'Excursión',...who,...extra});
const serve=(b,guests,extra={})=>({booking:b.id,guests,date:'2026-11-30',service:'Cena',...who,...extra});
function gate(f){let n=0,release;const wait=new Promise(r=>release=r);f.setGate(async statements=>{if(!statements.some(s=>s.sql.startsWith('INSERT INTO operation_requests')))return;if(++n===2)release();await wait;});}

test('individual restrictions and preferences preserve other guests, contracted regime, price and audit',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);
 assert.equal((await f.post('guestProfile',{guest:guests[0],version:0,name:'Ana',restrictions:'Celiaquía: texto indicado',preferences:'Prefiere frutas',...who})).status,200);
 const g=await f.one('SELECT * FROM booking_guests WHERE id=?',guests[1]);assert.equal(g.restrictions,'');
 const after=await f.one('SELECT * FROM bookings WHERE id=?',b.id);assert.equal(after.regime,b.regime);assert.equal(after.amount,b.amount);
 const rows=f.load('lib/hotel-meals.ts').kitchenRows(await data(f),'2026-11-30','Cena').filter(r=>r.booking===b.id);assert.equal(rows[0].restrictions,'Celiaquía: texto indicado');assert.equal(rows[1].restrictions,'');
 const log=await f.one("SELECT * FROM audit_log WHERE action='guestProfile'");assert.equal(JSON.parse(log.detail).input.responsible,who.responsible);assert.ok(log.created);
 assert.equal((await f.post('guestProfile',{guest:guests[0],version:0,...who})).status,409);
});
test('MP choice changes just the selected date without changing contracted meal or money',async t=>{
 const f=await fixture(t),{b}=await create(f);
 assert.equal((await f.post('meal',{booking:b.id,date:'2026-11-30',meal:'Almuerzo',...who})).status,200);
 const d=await data(f);assert.equal(forecast(f,d,'2026-11-30','Cena').length,0);assert.equal(forecast(f,d,'2026-11-30','Almuerzo').length,2);assert.equal(forecast(f,d,'2026-12-01','Cena').length,2);
 assert.equal((await f.one('SELECT meal FROM bookings WHERE id=?',b.id)).meal,'Cena');assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,20000);
});
test('one-person suspension reduces forecast and reactivation restores it without duplicate portions or money',async t=>{
 const f=await fixture(t),{b,guests}=await create(f),cash=await f.count('cash_movements'),sales=await f.count('sales');
 assert.equal((await f.post('mealSuspend',suspend(b,[guests[0]]))).status,200);
 let rows=forecast(f,await data(f));assert.equal(rows.reduce((n,r)=>n+r.expected,0),1);assert.equal(rows.find(r=>r.guest===guests[0]).state,'Suspendida');
 assert.equal((await f.post('mealSuspend',suspend(b,[guests[0]],{active:false,reason:'Regresó'}))).status,200);
 rows=forecast(f,await data(f));assert.equal(rows.reduce((n,r)=>n+r.expected,0),2);assert.equal(await f.count('meal_suspensions'),1);assert.equal(await f.count('cash_movements'),cash);assert.equal(await f.count('sales'),sales);
 assert.equal((await f.one("SELECT COUNT(*) n FROM audit_log WHERE action='mealSuspend'")).n,2);
});
test('interval suspension is inclusive, targets only selected people and does not affect other services',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);
 assert.equal((await f.post('mealSuspend',suspend(b,[guests[0]],{start:'2026-11-29',end:'2026-12-01'}))).status,200);
 assert.equal(await f.count('meal_suspensions'),3);
 assert.equal(forecast(f,await data(f),'2026-12-01').reduce((n,r)=>n+r.expected,0),1);
 assert.equal(forecast(f,await data(f),'2026-12-01','Desayuno').reduce((n,r)=>n+r.expected,0),2);
});
test('included service is explicit, unique per person/date/service and transactional under races',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);gate(f);
 const results=await Promise.all([f.post('mealServe',serve(b,[guests[0]])),f.post('mealServe',serve(b,[guests[0]]))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);f.setGate(null);
 assert.equal(await f.count('meal_services'),1);assert.equal((await f.one("SELECT SUM(qty) n FROM sales WHERE booking=? AND kind='Incluida'",b.id)).n,1);
 assert.equal((await f.post('mealServe',serve(b,[guests[1]]))).status,200);
 assert.ok(forecast(f,await data(f)).every(r=>r.state==='Servido'));assert.equal((await f.post('mealSuspend',suspend(b,[guests[0]]))).status,400);
 assert.equal((await f.post('meal',{booking:b.id,date:'2026-11-30',meal:'Almuerzo',...who})).status,400);
});
test('suspension/service race cannot serve a suspended guest and preserves the losing batch',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);gate(f);
 const results=await Promise.all([f.post('mealSuspend',suspend(b,[guests[0]])),f.post('mealServe',serve(b,[guests[0]]))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal(await f.count('meal_services')+await f.count('meal_suspensions'),1);
});
test('suspended people cannot be served via legacy API or direct SQL',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);await f.post('mealSuspend',suspend(b,[guests[0]]));
 assert.equal((await f.post('mealServe',serve(b,[guests[0]]))).status,400);
 assert.equal((await f.post('sale',{date:'2026-11-30',booking:b.id,customer:b.guest,kind:'Incluida',label:'Cena',service:'Cena',qty:2,price:0,account:'Efectivo'})).status,400);
 assert.equal((await f.post('sale',{date:'2026-11-30',booking:b.id,customer:b.guest,kind:'Incluida',label:'Cena',service:'Cena',qty:1,price:0,account:'Efectivo'})).status,400);
 await assert.rejects(f.raw.prepare("INSERT INTO sales VALUES ('bad','2026-11-30',?,?,'Cena',2,0,'Incluida','Cena',NULL,NULL)").bind(b.id,b.guest).run());
 assert.equal((await f.post('mealServe',serve(b,[guests[1]]))).status,200);
});
test('explicit external and additional plans contribute exact totals without inventing payments or deducing sales',async t=>{
 const f=await fixture(t),{guests}=await create(f),cash=await f.count('cash_movements');
 const plan={customer:'Grupo externo',date:'2026-11-30',service:'Cena',qty:3,...who};assert.equal((await f.post('mealPlan',plan)).status,200);
 assert.equal((await f.post('mealPlan',{...plan,guest:guests[0],qty:1})).status,400);
 assert.equal((await f.post('mealPlan',{...plan,guest:guests[0],qty:1,service:'Almuerzo'})).status,200);
 let d=await data(f),rows=f.load('lib/hotel-meals.ts').kitchenRows(d,'2026-11-30','Cena');assert.deepEqual(f.load('lib/hotel-meals.ts').kitchenTotals(rows),{hotel:2,external:3,total:5});
 assert.equal((await f.post('sale',{date:'2026-11-30',customer:'Venta suelta',kind:'Comida',label:'Cena',service:'Cena',qty:7,price:10,account:'Banco'})).status,200);
 d=await data(f);assert.equal(f.load('lib/hotel-meals.ts').kitchenTotals(f.load('lib/hotel-meals.ts').kitchenRows(d,'2026-11-30','Cena')).external,3);
 const p=await f.one('SELECT * FROM meal_plans WHERE guest IS NULL');assert.equal(p.status,'Pendiente');
 const cashAfterSale=await f.count('cash_movements');assert.equal(cashAfterSale,cash+1);
 assert.equal((await f.post('mealPlanStatus',{id:p.id,version:0,status:'Servido',...who})).status,200);assert.equal(await f.count('cash_movements'),cashAfterSale);
 assert.equal((await f.post('mealPlanStatus',{id:p.id,version:1,status:'Cancelada',...who})).status,400);
});
test('existing reservations, historical meals and payments survive migration without invented person attribution',async t=>{
 const f=await fixture(t,async raw=>{
  await raw.prepare("INSERT INTO rooms VALUES(199,'Doble','Limpia','')").run();
  await raw.prepare("INSERT INTO bookings VALUES('old-food','Histórico','',199,'2026-11-29','2026-12-02',2,'MP','Cena',12345,'Alojado','Directa','')").run();
  await raw.prepare("INSERT INTO sales VALUES('old-food-sale','2026-11-30','old-food','Histórico','Cena',1,0,'Incluida',NULL,NULL)").run();
  await raw.prepare("INSERT INTO cash_movements VALUES('old-food-pay','2026-11-29','Banco',5000,'Hotel','Cobro','old-food','Seña')").run();
 });
 assert.equal((await f.one("SELECT amount FROM bookings WHERE id='old-food'")).amount,12345);assert.equal((await f.one("SELECT amount FROM cash_movements WHERE id='old-food-pay'")).amount,5000);
 assert.equal((await f.one("SELECT COUNT(*) n FROM booking_guests WHERE booking='old-food'")).n,2);assert.equal((await f.one("SELECT COUNT(*) n FROM meal_services WHERE sale='old-food-sale'")).n,0);
 const rows=f.load('lib/hotel-meals.ts').kitchenRows(await data(f),'2026-11-30','Cena').filter(r=>r.booking==='old-food');assert.ok(rows.every(r=>r.state==='Servicio histórico sin atribución individual'));
 assert.equal((await f.post('mealServe',{booking:'old-food',guests:['old-food:person:2'],date:'2026-11-30',service:'Cena',...who})).status,400);assert.equal((await f.one("SELECT COUNT(*) n FROM sales WHERE booking='old-food'")).n,1);
});
test('planned additional meals cannot become included implicitly and closed dates reject attendance changes',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);
 await f.post('mealPlan',{guest:guests[0],customer:'Persona 1',date:'2026-11-30',service:'Almuerzo',qty:1,...who});
 assert.equal((await f.post('meal',{booking:b.id,date:'2026-11-30',meal:'Almuerzo',...who})).status,400);assert.equal((await f.one('SELECT COUNT(*) n FROM meal_overrides WHERE booking=?',b.id)).n,0);
 const cash=await f.one("SELECT SUM(amount) amount FROM cash_movements WHERE account='Efectivo' AND date<='2026-11-30'");
 assert.equal((await f.post('close',{date:'2026-11-30',counted:cash.amount/100})).status,200);
 assert.equal((await f.post('mealSuspend',suspend(b,guests))).status,400);assert.equal((await f.post('mealServe',serve(b,guests))).status,400);
 assert.equal((await f.post('mealPlan',{customer:'Externo',date:'2026-11-30',service:'Cena',qty:1,...who})).status,400);
});
test('additional attendance can be suspended, reactivated and served without affecting monetary balance',async t=>{
 const f=await fixture(t),{b,guests}=await create(f);
 const p={guest:guests[0],customer:'Adicional',date:'2026-11-30',service:'Almuerzo',qty:1,...who};await f.post('mealPlan',p);
 await f.post('mealSuspend',suspend(b,[guests[0]],{service:'Almuerzo'}));assert.equal(forecast(f,await data(f),'2026-11-30','Almuerzo')[0].expected,0);
 const plan=await f.one('SELECT * FROM meal_plans WHERE guest=?',guests[0]);assert.equal((await f.post('mealPlanStatus',{id:plan.id,version:0,status:'Servido',...who})).status,400);
 await f.post('mealSuspend',suspend(b,[guests[0]],{service:'Almuerzo',active:false}));assert.equal(forecast(f,await data(f),'2026-11-30','Almuerzo')[0].expected,1);
 assert.equal((await f.post('mealPlanStatus',{id:plan.id,version:0,status:'Servido',...who})).status,200);assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,b.amount);
});
test('departure services expose existing exclusion and only explicitly confirmed additional plans enter totals',async t=>{
 const f=await fixture(t),{guests}=await create(f),date='2026-12-02';let rows=forecast(f,await data(f),date,'Desayuno');assert.equal(rows.length,2);assert.ok(rows.every(r=>r.state==='Sin confirmar'&&r.expected===0));
 assert.equal((await f.post('mealPlan',{guest:guests[0],customer:'Persona 1',date,service:'Desayuno',qty:1,...who})).status,200);
 rows=forecast(f,await data(f),date,'Desayuno');assert.equal(rows.reduce((n,r)=>n+r.expected,0),1);assert.equal(rows[0].character,'Adicional');
});
test('hotel date and remaining nights handle timezone, month changes, today, tomorrow, late and closed stays',async t=>{
 const f=await fixture(t),m=f.load('lib/hotel-meals.ts');assert.equal(m.hotelDate(new Date('2026-12-01T01:30:00Z')),'2026-11-30');
 assert.equal(m.departureText({...booking,status:'Alojado'},'2026-11-29'),'Quedan 3 noches');assert.equal(m.departureText({...booking,status:'Alojado'},'2026-12-01'),'Sale mañana');assert.equal(m.departureText({...booking,status:'Alojado'},'2026-12-02'),'Sale hoy');assert.equal(m.departureText({...booking,status:'Alojado'},'2026-12-03'),'Salida pendiente de registrar');assert.equal(m.departureText({...booking,status:'Finalizada'},'2026-12-03'),'Finalizada');assert.equal(m.departureText({...booking,status:'Cancelada'},'2026-12-03'),'Cancelada');
});
