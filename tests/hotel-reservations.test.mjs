import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/hotel-fixture.mjs';

const booking={guest:'Test stage one',room:2,start:'2026-11-01',end:'2026-11-04',pax:2,regime:'Desayuno',meal:'Cena',source:'Directa'};
const rate={type:'Doble',regime:'Desayuno',start:'2026-11-01',end:'2026-11-02',amount:100.25,responsible:'Gerente de prueba'};
const agreed={...booking,priceMode:'Acordado',amount:300.75,reason:'Acuerdo de prueba sin tarifa completa',responsible:'Gerente de prueba'};
const snapshot=async f=>await (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
async function created(f,data=agreed){const result=await f.post('booking',data);assert.equal(result.status,200,JSON.stringify(result));return f.one('SELECT * FROM bookings WHERE guest=?',data.guest);}
async function editable(f,b,extra={}){const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id);return {...agreed,...b,id:b.id,version:terms.version,priceMode:'Conservar',...extra};}
function gate(f){let arrivals=0,release;const wait=new Promise(r=>release=r);f.setGate(async statements=>{if(!statements.some(s=>s.sql.startsWith('INSERT INTO operation_requests')))return;if(++arrivals===2)release();await wait;});}

test('per-night rates cross periods and remain frozen after rate changes',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post('rate',rate)).status,200);
 assert.equal((await f.post('rate',{...rate,start:'2026-11-03',end:'2026-11-10',amount:200.50})).status,200);
 const b=await created(f,booking);assert.equal(b.amount,40100);
 const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id);
 assert.deepEqual(JSON.parse(terms.snapshot).map(n=>[n.date,n.amount]),[['2026-11-01',10025],['2026-11-02',10025],['2026-11-03',20050]]);
 const r=await f.one('SELECT * FROM room_rates WHERE start=?',rate.start);
 assert.equal((await f.post('rate',{...r,amount:900})).status,200);
 assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,40100);
 // Preserve mode still works after the referenced rate was edited.
 assert.equal((await f.post('bookingEdit',await editable(f,b,{paymentCondition:'Pago al egreso'}))).status,200);
 assert.equal((await f.one('SELECT snapshot FROM booking_terms WHERE booking=?',b.id)).snapshot,terms.snapshot);
 assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,40100);
});

test('rates reject overlapping inclusive validity, stale edits and simultaneous overlaps',async t=>{
 const f=await fixture(t);gate(f);
 const results=await Promise.all([f.post('rate',rate),f.post('rate',{...rate,start:'2026-11-02',end:'2026-11-04'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);f.setGate(null);
 const r=await f.one('SELECT * FROM room_rates');
 assert.equal((await f.post('rate',{...r,amount:20})).status,200);
 assert.equal((await f.post('rate',{...r,amount:30})).status,409);
 assert.equal((await f.post('rate',{...rate,type:'Single'})).status,200);
 assert.equal((await f.post('rate',{...rate,regime:'MP'})).status,200);
 assert.equal((await f.post('rate',{...rate,start:'2026-12-01',end:'2026-11-30'})).status,400);
});

test('missing rates require an explained agreed price and special prices never create cash',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post('booking',booking)).status,400);
 assert.equal((await f.post('booking',{...agreed,reason:''})).status,400);
 assert.equal((await f.post('booking',{...agreed,responsible:''})).status,400);
 const before=await f.count('cash_movements'),b=await created(f);
 const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id);
 assert.equal(terms.tariff_total,null);assert.equal(terms.base_amount,30075);
 assert.ok(JSON.parse(terms.snapshot).every(n=>n.amount===null));
 assert.equal(await f.count('cash_movements'),before);
});

test('database and API reject concurrent reservations but allow consecutive stays',async t=>{
 const f=await fixture(t);gate(f);
 const results=await Promise.all([f.post('booking',agreed),f.post('booking',{...agreed,guest:'Second'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);f.setGate(null);
 assert.equal((await f.post('booking',{...agreed,guest:'Consecutive',start:agreed.end,end:'2026-11-05'})).status,200);
 await assert.rejects(f.raw.prepare("INSERT INTO bookings VALUES ('sql-conflict','SQL','',2,'2026-11-02','2026-11-03',1,'Desayuno','Cena',0,'Confirmada','Directa','')").run(),/HOT_UNAVAILABLE/);
});

test('failed date/room edits preserve original nights, pricing, payments and metadata',async t=>{
 const f=await fixture(t),b=await created(f);
 const other=await created(f,{...agreed,guest:'Other',room:3});
 const before=await snapshot(f);
 assert.equal((await f.post('bookingEdit',await editable(f,b,{room:3,priceMode:'Acordado',amount:350}))).status,400);
 let after=await snapshot(f);assert.deepEqual(after.bookings,before.bookings);assert.deepEqual(after.booking_terms,before.booking_terms);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=?',b.id)).n,3);
 assert.equal((await f.post('bookingEdit',await editable(f,b,{start:'2026-11-03',end:'2026-11-06'}))).status,400);
 assert.equal((await f.post('bookingEdit',await editable(f,b,{room:4,start:'2026-11-03',end:'2026-11-06',priceMode:'Acordado',amount:350}))).status,200);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=? AND room=2',b.id)).n,0);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=? AND room=4',b.id)).n,3);
 assert.equal((await f.post('booking',{...agreed,guest:'Released old room'})).status,200);
 assert.equal((await f.one('SELECT room FROM bookings WHERE id=?',other.id)).room,3);
});

test('simultaneous edits use versions and preserve the winning reservation atomically',async t=>{
 const f=await fixture(t),b=await created(f);const edit=await editable(f,b,{priceMode:'Acordado',amount:400});gate(f);
 const results=await Promise.all([f.post('bookingEdit',{...edit,room:3}),f.post('bookingEdit',{...edit,room:4})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);f.setGate(null);
 const current=await f.one('SELECT * FROM bookings WHERE id=?',b.id);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=? AND room=?',b.id,current.room)).n,3);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=?',b.id)).n,3);
});

test('dated maintenance and whole-room blocks reject reservations and release preserves history',async t=>{
 const f=await fixture(t),block={room:2,start:'2026-11-02',end:'2026-11-03',reason:'Mantenimiento',responsible:'Test'};
 assert.equal((await f.post('block',block)).status,200);
 assert.equal((await f.post('booking',agreed)).status,400);
 await assert.rejects(f.raw.prepare("INSERT INTO bookings VALUES ('sql-block','SQL','',2,'2026-11-02','2026-11-03',1,'Desayuno','Cena',0,'Confirmada','Directa','')").run(),/HOT_UNAVAILABLE/);
 assert.equal((await f.post('booking',{...agreed,room:24})).status,400);
 assert.equal((await f.post('booking',{...agreed,end:'2026-11-02'})).status,200);
 assert.equal((await f.post('block',{...block,start:'2026-11-01'})).status,400);
 const stored=await f.one('SELECT * FROM room_blocks');
 assert.equal((await f.post('unblock',{id:stored.id,reason:'Reparación completada',responsible:'Test'})).status,200);
 assert.equal((await f.one('SELECT active FROM room_blocks WHERE id=?',stored.id)).active,0);
 assert.equal((await f.post('booking',{...agreed,guest:'After maintenance',start:'2026-11-02'})).status,200);
});

test('a simultaneous maintenance block and reservation cannot both occupy nights',async t=>{
 const f=await fixture(t);gate(f);
 const results=await Promise.all([f.post('booking',agreed),f.post('block',{room:2,start:booking.start,end:booking.end,reason:'Test',responsible:'Test'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});

test('discounts, friends, partial payments and consumption produce real monetary balances',async t=>{
 const f=await fixture(t),b=await created(f,{...agreed,amount:123.45,benefit:'Descuento',discountType:'Porcentaje',discountValue:12.5});
 assert.equal(b.amount,10802); // 12345 - rounded 1543 cents.
 const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id);assert.equal(terms.discount_amount,1543);
 assert.equal((await f.post('payment',{booking:b.id,date:booking.start,amount:50,account:'Banco'})).status,200);
 assert.equal((await f.post('sale',{date:booking.start,booking:b.id,customer:b.guest,kind:'Comida',label:'Cena',qty:1,price:20.10,account:'Efectivo',charge:true})).status,200);
 const d=await snapshot(f),balance=f.load('lib/hotel-view.ts').bookingBalance(d.bookings.find(x=>x.id===b.id),d.sales,d.cash_movements);
 assert.equal(balance,7812);
 const friend=await created(f,{...agreed,guest:'Friend',room:3,benefit:'Amigo'});assert.equal(friend.amount,30075);
 const flat=await created(f,{...agreed,guest:'Flat',room:4,benefit:'Descuento',discountType:'Importe',discountValue:0.75});assert.equal(flat.amount,30000);
 assert.equal((await f.post('booking',{...agreed,room:5,benefit:'Descuento',discountType:'Porcentaje',discountValue:101})).status,400);
 assert.equal((await f.post('booking',{...agreed,room:5,benefit:'Descuento',discountType:'Importe',discountValue:400})).status,400);
 assert.equal((await f.post('booking',{...agreed,room:5,amount:0.001})).status,400);
 assert.equal((await f.post('bookingEdit',await editable(f,b,{priceMode:'Acordado',amount:10}))).status,400);
 assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,10802);
});

test('courtesy and barter never create fake cash; barter remains pending until explicitly recorded',async t=>{
 const f=await fixture(t),count=await f.count('cash_movements');
 const courtesy=await created(f,{...agreed,benefit:'Cortesía'});assert.equal(courtesy.amount,0);
 const barter=await created(f,{...agreed,guest:'Barter',room:3,benefit:'Canje',amount:0,barterAgreement:'Servicio acordado, sin componente monetario'});
 let terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',barter.id);assert.equal(terms.barter_status,'Pendiente');
 assert.equal((await f.post('status',{id:barter.id,status:'Finalizada'})).status,200);
 assert.equal((await f.one('SELECT barter_status FROM booking_terms WHERE booking=?',barter.id)).barter_status,'Pendiente');
 assert.equal((await f.post('barter',{booking:barter.id,version:terms.version,status:'Parcial',responsible:'Test',observation:'Primera entrega recibida'})).status,200);
 assert.equal((await f.post('barter',{booking:barter.id,version:terms.version,status:'Cumplido',responsible:'Test',observation:'Stale update'})).status,409);
 terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',barter.id);
 assert.equal((await f.post('barter',{booking:barter.id,version:terms.version,status:'Cumplido',responsible:'Test',observation:'Servicio recibido completo'})).status,200);
 assert.equal(await f.count('cash_movements'),count);
});

test('cancellation releases nights without deleting history and payment/cancel races preserve regularization',async t=>{
 const f=await fixture(t),free=await created(f);
 assert.equal((await f.post('status',{id:free.id,status:'Cancelada'})).status,200);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=?',free.id)).n,0);
 assert.equal((await f.one('SELECT status FROM bookings WHERE id=?',free.id)).status,'Cancelada');
 assert.ok(await f.one('SELECT * FROM booking_terms WHERE booking=?',free.id));
 const b=await created(f,{...agreed,guest:'Race'});gate(f);
 const results=await Promise.all([f.post('status',{id:b.id,status:'Cancelada'}),f.post('payment',{date:booking.start,booking:b.id,amount:50,account:'Banco'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);f.setGate(null);
 const saved=await f.one('SELECT status FROM bookings WHERE id=?',b.id),payments=await f.one("SELECT COUNT(*) n FROM cash_movements WHERE ref=? AND kind='Cobro'",b.id);
 if(saved.status==='Cancelada'){assert.equal(payments.n,0);assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=?',b.id)).n,0)}
 else{assert.equal(payments.n,1);assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=?',b.id)).n,3);assert.equal((await f.post('status',{id:b.id,status:'Cancelada'})).status,400)}
});

test('migration preserves historical amounts, payments and lack of tariff details',async t=>{
 const f=await fixture(t,async raw=>{
  await raw.prepare("INSERT INTO rooms VALUES (99,'Single','Limpia','')").run();
  await raw.prepare("INSERT INTO bookings VALUES ('historical','Historical','',99,'2026-11-01','2026-11-03',1,'Desayuno','Cena',12345,'Confirmada','Directa','Original')").run();
  await raw.prepare("INSERT INTO cash_movements VALUES ('historical-pay','2026-11-01','Banco',5000,'Hotel','Cobro','historical','Real payment')").run();
 });
 assert.equal((await f.one("SELECT amount FROM bookings WHERE id='historical'")).amount,12345);
 const terms=await f.one("SELECT * FROM booking_terms WHERE booking='historical'");
 assert.equal(terms.base_amount,12345);assert.equal(terms.price_mode,'Historico');assert.equal(terms.snapshot,'[]');assert.equal(terms.discount_amount,0);
 assert.equal((await f.one("SELECT amount FROM cash_movements WHERE ref='historical'")).amount,5000);
 assert.equal(await f.count('room_rates'),0);
});

test('rates changed between quote and commit roll back the whole reservation',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post('rate',{...rate,end:booking.end})).status,200);
 const r=await f.one('SELECT * FROM room_rates');
 let ready,release;const arrived=new Promise(resolve=>ready=resolve),wait=new Promise(resolve=>release=resolve);
 f.setGate(async statements=>{if(!statements.some(s=>s.sql.startsWith('INSERT INTO bookings')))return;ready();await wait});
 const pending=f.post('booking',booking);await arrived;
 assert.equal((await f.post('rate',{...r,amount:999})).status,200);release();
 assert.equal((await pending).status,409);
 assert.equal(await f.one('SELECT id FROM bookings WHERE guest=?',booking.guest),null);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE room=2')).n,0);
});

test('a changed tariff shown in the browser requires a fresh quote before saving',async t=>{
 const f=await fixture(t);
 await f.post('rate',{...rate,end:booking.end});
 const r=await f.one('SELECT * FROM room_rates');
 const quote=f.load('lib/hotel-reservations.ts').quoteStay([r],r.type,r.regime,booking.start,booking.end);
 await f.post('rate',{...r,amount:999});
 assert.equal((await f.post('booking',{...booking,quoteSnapshot:JSON.stringify(quote.nights)})).status,409);
 assert.equal(await f.one('SELECT id FROM bookings WHERE guest=?',booking.guest),null);
});

test('a room occupied after edit validation causes transactional rollback of terms and nights',async t=>{
 const f=await fixture(t),b=await created(f),edit=await editable(f,b,{room:3,priceMode:'Acordado',amount:500});
 const before=await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id);
 let ready,release;const arrived=new Promise(resolve=>ready=resolve),wait=new Promise(resolve=>release=resolve);
 f.setGate(async statements=>{if(!statements.some(s=>s.sql.startsWith('UPDATE bookings SET guest=')))return;ready();await wait});
 const pending=f.post('bookingEdit',edit);await arrived;
 await created(f,{...agreed,guest:'Occupied during edit',room:3});release();
 assert.equal((await pending).status,400);
 assert.deepEqual(await f.one('SELECT * FROM bookings WHERE id=?',b.id),b);
 assert.deepEqual(await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id),before);
 assert.equal((await f.one('SELECT COUNT(*) n FROM room_nights WHERE booking=? AND room=2',b.id)).n,3);
});

test('preserved discounted prices cannot be changed implicitly and served dates remain inside the stay',async t=>{
 const f=await fixture(t),b=await created(f,{...agreed,benefit:'Descuento',discountType:'Importe',discountValue:10});
 assert.equal((await f.post('bookingEdit',await editable(f,b))).status,400);
 assert.equal((await f.post('bookingEdit',await editable(f,b,{benefit:'Descuento',discountType:'Importe',discountValue:10,paymentCondition:'Pago al egreso'}))).status,200);
 assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,29075);
 assert.equal((await f.post('sale',{date:booking.start,booking:b.id,customer:b.guest,kind:'Comida',label:'Cena',qty:1,price:10,account:'Banco',charge:true})).status,200);
 const current=await f.one('SELECT * FROM bookings WHERE id=?',b.id);
 assert.equal((await f.post('bookingEdit',await editable(f,current,{priceMode:'Acordado',amount:300.75,start:'2026-11-02'}))).status,400);
 assert.deepEqual(await f.one('SELECT * FROM bookings WHERE id=?',b.id),current);
});
