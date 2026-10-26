import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { fixture } from './helpers/hotel-fixture.mjs';
const start='2026-11-01',end='2026-11-04';
const bed={mode:'Noche',value:10,reason:'Adicional acordado de prueba'};
const booking={guest:'Triple de prueba',room:2,start,end,pax:3,regime:'PC',meal:'Cena',source:'Directa',priceMode:'Acordado',amount:300,reason:'Alojamiento de prueba',extraBed:bed};
async function saved(f){return f.one("SELECT * FROM bookings WHERE guest='Triple de prueba'");}
async function edit(f,b,extra={}){const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',b.id);return {...b,id:b.id,version:terms.version,priceMode:'Acordado',amount:300,reason:'Nuevo acuerdo',...extra};}

test('requested extra bed admits three guests, adds the agreed nightly cost once and creates three independent meal profiles',async t=>{
 const f=await fixture(t),cash=await f.count('cash_movements');assert.equal((await f.post('booking',booking)).status,200);
 const b=await saved(f),e=await f.one('SELECT * FROM booking_extra_beds WHERE booking=?',b.id);assert.equal(b.amount,33000);assert.equal(e.total,3000);assert.equal(e.actor,'Test Administrator');assert.equal(await f.count('cash_movements'),cash);
 const guests=(await f.raw.prepare('SELECT * FROM booking_guests WHERE booking=? ORDER BY position').bind(b.id).all()).results;assert.equal(guests.length,3);assert.ok(guests.every(g=>g.name===''));
 assert.equal((await f.post('guestProfile',{guest:guests[2].id,version:0,name:'Tercera persona',restrictions:'Restricción declarada',preferences:'',observation:''})).status,200);
 const d=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json(),domain=f.load('modules/meals/domain.ts');
 assert.equal(domain.kitchenRows(d,start,'Cena').filter(r=>r.booking===b.id).length,3);
 assert.equal((await f.post('mealServe',{booking:b.id,guests:[guests[2].id],date:start,service:'Cena'})).status,200);
});

test('total price and explicitly included bed preserve the chosen amount and prevent accidental fourth guests',async t=>{
 const f=await fixture(t);assert.equal((await f.post('booking',{...booking,extraBed:{...bed,mode:'Total',value:25}})).status,200);assert.equal((await saved(f)).amount,32500);
 const count=await f.count('bookings');for(const extra of [{room:3,extraBed:undefined},{room:3,pax:4},{room:25,extraBed:bed},{room:3,extraBed:{...bed,reason:''}}]){assert.equal((await f.post('booking',{...booking,...extra})).status,400);assert.equal(await f.count('bookings'),count);}
 assert.equal((await f.post('booking',{...booking,guest:'Incluida',room:3,extraBed:{mode:'Total',value:0,reason:'Incluida expresamente en precio'}})).status,200);assert.equal((await f.one("SELECT amount FROM bookings WHERE guest='Incluida'")).amount,30000);
 await assert.rejects(f.raw.prepare("INSERT INTO bookings VALUES ('raw-triple','Raw','',4,?,?,3,'PC','Cena',100,'Confirmada','Directa','')").bind(start,end).run(),/HOT_EXTRA_BED_REQUIRED/);
});

test('bed edits require a new explicit price and preserve previous values when the change fails',async t=>{
 const f=await fixture(t);await f.post('booking',booking);let b=await saved(f);
 assert.equal((await f.post('bookingEdit',await edit(f,b,{extraBed:{mode:'Total',value:20,reason:'Total nuevo'}}))).status,200);assert.equal((await saved(f)).amount,32000);
 b=await saved(f);assert.equal((await f.post('bookingEdit',await edit(f,b,{priceMode:'Conservar',extraBed:{...bed,value:100}}))).status,400);assert.equal((await saved(f)).amount,32000);
 assert.equal((await f.post('bookingEdit',await edit(f,b,{removeExtraBed:true,pax:3}))).status,400);
 assert.equal((await f.post('bookingEdit',await edit(f,b,{removeExtraBed:true,pax:2}))).status,200);assert.equal((await saved(f)).amount,30000);assert.equal(await f.count('booking_extra_beds'),0);
});

test('group person/night and whole-stay contracts include explicit bed additions without creating duplicate payments',async t=>{
 const f=await fixture(t),rooms=[{...booking,guest:undefined,amount:undefined},{...booking,room:3,pax:1,extraBed:undefined,guest:undefined,amount:undefined}],input={name:'Grupo con cama extra',pax:4,customer:{name:'Contacto de prueba'},rooms,pricing:{mode:'Persona/noche',value:100,reason:'Acuerdo grupal'},deposit:{date:start,amount:100,account:'Banco'}};
 assert.equal((await f.post('groupCreate',input)).status,200);const g=await f.one('SELECT * FROM reservation_groups ORDER BY rowid DESC LIMIT 1'),price=await f.one('SELECT * FROM group_prices WHERE group_id=?',g.id);
 assert.equal(price.person_nights,12);assert.equal(price.total,123000);assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE ref=? AND kind='Cobro'",g.id)).n,10000);
 const second={...input,name:'Grupo total',rooms:rooms.map((r,i)=>({...r,room:i?5:4})),pricing:{mode:'Total',value:500,reason:'Total base grupal'}};
 assert.equal((await f.post('groupCreate',second)).status,200);assert.equal((await f.one('SELECT total FROM group_prices ORDER BY rowid DESC LIMIT 1')).total,53000);
});

test('moving a triple preserves bed cost and blocks a destination unable to host it',async t=>{
 const f=await fixture(t);await f.post('booking',booking);const b=await saved(f),move={id:b.id,room:25,version:0,mode:'Completa',reason:'Cambio de habitación'};
 assert.equal((await f.post('roomMove',move)).status,400);assert.equal((await f.post('roomMove',{...move,room:4})).status,200);
 assert.equal((await saved(f)).room,4);assert.equal((await saved(f)).amount,33000);assert.equal((await f.one('SELECT total FROM booking_extra_beds WHERE booking=?',b.id)).total,3000);
});

test('failed deposit rolls back booking, bed request, guests and customer together',async t=>{
 const f=await fixture(t),count=await f.count('bookings');assert.equal((await f.post('booking',{...booking,deposit:{date:start,amount:400,account:'Banco'}})).status,400);assert.equal(await f.count('bookings'),count);assert.equal(await f.count('booking_extra_beds'),0);
});

test('migration preserves all previous rows and does not invent extra beds or additional guests',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0017').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name),before=Object.fromEntries(tables.map(n=>[n,db.prepare('SELECT * FROM '+n).all()]));db.exec(readFileSync('drizzle/0017_slippery_the_liberteens.sql','utf8'));for(const n of tables)assert.deepEqual(db.prepare('SELECT * FROM '+n).all(),before[n],n);assert.equal(db.prepare('SELECT count(*) n FROM booking_extra_beds').get().n,0);
});
