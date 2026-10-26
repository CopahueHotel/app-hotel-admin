import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture,testPassword} from './helpers/hotel-fixture.mjs';
const date='2026-11-01';
const room=(id,pax=1,end='2026-11-04')=>({room:id,pax,start:date,end,regime:'PC',meal:'Cena',source:'Directa'});
const input=(extra={})=>({name:'Grupo local de prueba',pax:3,customer:{name:'Contacto de prueba'},rooms:[room(2,2),room(3,1)],pricing:{mode:'Persona/noche',value:100,reason:'Acuerdo de prueba'},...extra});
async function data(f){return (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();}
async function group(f){return f.one('SELECT * FROM reservation_groups ORDER BY rowid DESC LIMIT 1');}

test('one common person/night price counts a sole occupant once and preserves frozen group terms',async t=>{
 const f=await fixture(t);assert.equal((await f.post('groupCreate',input())).status,200);
 const g=await group(f),d=await data(f),a=f.load('modules/reservations/group-account.ts').groupAccount(d,g.id),price=d.group_prices[0];
 assert.equal(price.total,90000);assert.equal(price.person_nights,9);assert.equal(price.actor,'Test Administrator');assert.equal(a.balance,90000);
 assert.deepEqual(a.members.map(b=>b.amount).sort((a,b)=>a-b),[30000,60000]);
 await f.post('rate',{type:'Doble',regime:'PC',start:date,end:'2026-11-04',amount:500});
 assert.deepEqual((await f.one('SELECT * FROM group_prices WHERE group_id=?',g.id)),price);
 assert.equal((await f.post('groupMembers',{id:g.id,version:g.version,bookings:[a.members[0].id],active:false,reason:'Test'})).status,400);
});

test('whole-stay totals distribute integer cents exactly and use each room own dates',async t=>{
 const f=await fixture(t),pricing=f.load('modules/reservations/group-account.ts').groupPricing;
 assert.deepEqual(pricing('Total',100.01,[room(2,2),room(3,1)]).amounts,[6667,3334]);
 assert.equal(pricing('Persona/noche',100,[room(2,2),room(3,1,'2026-11-03')]).total,80000);
 assert.equal((await f.post('groupCreate',input({pricing:{mode:'Total',value:100.01,reason:'Total acordado'}}))).status,200);
 const d=await data(f);assert.equal(d.bookings.filter(b=>d.group_bookings.some(l=>l.booking===b.id)).reduce((s,b)=>s+b.amount,0),10001);
});

test('group deposit is one real payment against the group, supports USD and remains atomic and idempotent',async t=>{
 const f=await fixture(t),key=crypto.randomUUID(),request=input({deposit:{date,amount:100,account:'Efectivo',currency:'USD',usdAmount:1,exchangeRate:100}});
 assert.equal((await f.post('groupCreate',request,key)).status,200);assert.equal((await f.post('groupCreate',request,key)).status,200);
 const g=await group(f),d=await data(f),a=f.load('modules/reservations/group-account.ts').groupAccount(d,g.id);
 assert.equal(a.payments,10000);assert.equal(a.balance,80000);assert.equal(d.cash_movements.filter(m=>m.ref===g.id).length,1);assert.equal(d.cash_movements.filter(m=>a.members.some(b=>b.id===m.ref)).length,0);
 assert.equal(d.cash_receipts.length,1);
 assert.equal((await f.post('payment',{date,booking:a.members[0].id,amount:1,account:'Efectivo'})).status,400);
 const before=await f.count('bookings');assert.equal((await f.post('groupCreate',input({rooms:[room(4,2),room(5)],deposit:{date,amount:1000,account:'Banco'}}))).status,400);assert.equal(await f.count('bookings'),before);
});

test('group balance includes room consumptions and shared payments, enables checkout only after settlement',async t=>{
 const f=await fixture(t);await f.post('groupCreate',input());let g=await group(f),d=await data(f);const member=d.group_bookings.find(l=>l.group_id===g.id).booking;
 await f.post('sale',{date,booking:member,customer:'Test',kind:'Comida',label:'Adicional',qty:1,price:10,account:'Efectivo',charge:true});
 assert.equal((await f.post('groupPayment',{id:g.id,version:g.version,date,amount:400,account:'Banco'})).status,200);
 assert.equal((await f.post('status',{id:member,status:'Finalizada'})).status,400);
 g=await group(f);assert.equal((await f.post('groupPayment',{id:g.id,version:g.version,date,amount:510,account:'Efectivo'})).status,200);
 d=await data(f);assert.equal(f.load('modules/reservations/group-account.ts').groupAccount(d,g.id).balance,0);
 assert.equal((await f.post('status',{id:member,status:'Alojado'})).status,200);assert.equal((await f.post('status',{id:member,status:'Finalizada'})).status,200);
 assert.equal((await f.post('status',{id:d.group_bookings.find(l=>l.group_id===g.id&&l.booking!==member).booking,status:'Cancelada'})).status,400);
});

test('simultaneous group payments cannot overcollect and preserve the losing batch',async t=>{
 const f=await fixture(t);await f.post('groupCreate',input());const g=await group(f);let arrivals=0,release;const wait=new Promise(r=>release=r);
 f.setGate(async statements=>{if(!statements.some(s=>s.sql.startsWith('INSERT INTO operation_requests')))return;if(++arrivals===2)release();await wait;});
 const d={id:g.id,version:g.version,date,amount:600,account:'Banco'},results=await Promise.all([f.post('groupPayment',d),f.post('groupPayment',d)]);
 assert.equal(results.filter(r=>r.status===200).length,1);f.setGate(null);assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE ref=? AND kind='Cobro'",g.id)).n,60000);
});

test('individual booking accepts a deposit in the same transaction and PC includes all three services',async t=>{
 const f=await fixture(t);assert.equal((await f.post('booking',{...room(2,1),guest:'Reserva individual',priceMode:'Acordado',amount:300,reason:'Test',deposit:{date,amount:100,account:'Banco'}})).status,200);
 const b=await f.one("SELECT * FROM bookings WHERE guest='Reserva individual'");assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE ref=? AND kind='Cobro'",b.id)).n,10000);
 const includes=f.load('modules/shared/regimes.ts').regimeIncludesService;for(const service of ['Desayuno','Almuerzo','Cena'])assert.equal(includes('PC',service,'Cena'),true);
 const before=await f.count('bookings');assert.equal((await f.post('booking',{...room(4),guest:'Failed',priceMode:'Acordado',amount:10,reason:'Test',deposit:{date,amount:20,account:'Banco'}})).status,400);assert.equal(await f.count('bookings'),before);
});

test('common prices and deposits require their real price/collection permissions',async t=>{
 const f=await fixture(t);await f.post('userSave',{name:'Recepción',email:'group-limited@example.test',roles:['reception'],active:true,password:testPassword});const login=await f.auth.login(f.authRequest('/api/auth/login',{email:'group-limited@example.test',password:testPassword})),cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await f.api.POST(f.authRequest('/api/hotel',{action:'groupCreate',data:input({deposit:{date,amount:100,account:'Banco'}})},{Cookie:cookie,'Idempotency-Key':crypto.randomUUID()}));assert.equal(response.status,403);assert.equal(await f.count('reservation_groups'),0);
});

test('migration preserves all historical rows and payments and creates no invented group agreements',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0016').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name),before=Object.fromEntries(tables.map(n=>[n,db.prepare('SELECT * FROM '+n).all()]));db.exec(readFileSync('drizzle/0016_glossy_ego.sql','utf8'));for(const n of tables)assert.deepEqual(db.prepare('SELECT * FROM '+n).all(),before[n],n);assert.equal(db.prepare('SELECT COUNT(*) n FROM group_prices').get().n,0);
});
