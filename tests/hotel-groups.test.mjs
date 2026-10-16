import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture,testPassword} from './helpers/hotel-fixture.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUi} from './helpers/hotel-ui.mjs';

const line=(room,extra={})=>({room,start:'2026-11-01',end:'2026-11-03',pax:1,regime:'Desayuno',meal:'Cena',source:'Directa',priceMode:'Acordado',amount:100,reason:'Acuerdo de prueba',paymentCondition:'Seña y saldo al ingreso',...extra});
const group=(name,rooms,extra={})=>({name,pax:rooms.reduce((sum,row)=>sum+row.pax,0),customer:{name:name+' Contact'},rooms,...extra});
const snapshot=async(f,tables)=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,JSON.stringify((await f.raw.prepare('SELECT * FROM '+table+' ORDER BY 1').all()).results)])));
async function asReception(f){
 const hash=await f.load('modules/access/passwords.ts').hashPassword(testPassword);
 await f.raw.prepare('INSERT INTO users(id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').bind('group-reception','Group Reception','group@example.test','["reception"]',hash).run();
 const login=await f.auth.login(f.authRequest('/api/auth/login',{email:'group@example.test',password:testPassword}));
 const cookie=login.headers.get('set-cookie').split(';')[0];
 return async(action,data)=>f.api.POST(f.authRequest('/api/hotel',{action,data},{Cookie:cookie,'Idempotency-Key':crypto.randomUUID()}));
}

test('group creation stores several bookings and one contact atomically, retains nightly prices and creates no money movements',async t=>{
 const f=await fixture(t),before=await f.count('customers'),cash=await f.count('cash_movements');
 const rooms=(await f.raw.prepare("SELECT id FROM rooms WHERE type='Doble' ORDER BY id LIMIT 2").all()).results.map(r=>r.id);
 for(const [start,end,amount] of [['2026-11-01','2026-11-01',100],['2026-11-02','2026-11-02',200]])assert.equal((await f.post('rate',{type:'Doble',regime:'Desayuno',start,end,amount})).status,200);
 const input=group('Price group',rooms.map((room,index)=>line(room,{pax:index?1:2,priceMode:'Tarifa',responsible:'spoof'})));
 const key=crypto.randomUUID();assert.equal((await f.post('groupCreate',input,key)).status,200);assert.equal((await f.post('groupCreate',input,key)).status,200);
 const saved=await f.one("SELECT * FROM reservation_groups WHERE name='Price group'");assert.equal(saved.created_by,'test-admin');assert.equal(saved.pax,3);assert.equal(await f.count('customers'),before+1);assert.equal(await f.count('cash_movements'),cash);
 const bookings=(await f.raw.prepare('SELECT b.* FROM bookings b JOIN group_bookings l ON l.booking=b.id WHERE l.group_id=?').bind(saved.id).all()).results;
 assert.equal(bookings.length,2);assert.ok(bookings.every(b=>b.amount===30000));
 assert.equal((await f.one('SELECT count(DISTINCT customer) n FROM booking_clients WHERE booking IN (SELECT booking FROM group_bookings WHERE group_id=?)',saved.id)).n,1);
 assert.equal((await f.one("SELECT count(*) n FROM booking_guests WHERE booking IN (SELECT booking FROM group_bookings WHERE group_id=?) AND name<>''",saved.id)).n,0);
 const terms=await snapshot(f,['booking_terms']);assert.ok((await f.raw.prepare('SELECT snapshot FROM booking_terms WHERE booking=?').bind(bookings[0].id).first()).snapshot.includes('20000'));
 const rate=await f.one("SELECT * FROM room_rates WHERE start='2026-11-02'");assert.equal((await f.post('rate',{...rate,amount:500})).status,200);assert.deepEqual(await snapshot(f,['booking_terms']),terms);
 assert.equal((await f.one("SELECT actor_id FROM audit_log WHERE action='groupCreate'")).actor_id,'test-admin');
});

test('unavailable rooms, missing rates, repeated rooms, wrong capacity and incorrect distribution leave neither partial groups nor contacts',async t=>{
 const f=await fixture(t),tables=['customers','bookings','booking_clients','booking_terms','room_nights','reservation_groups','group_bookings','cash_movements'];
 const before=await snapshot(f,tables);
 const requests=[group('Overlap',[line(2),line(7,{start:'2026-10-01',end:'2026-10-03'})]),group('Missing',[line(2),line(3,{priceMode:'Tarifa'})]),group('Repeat',[line(2),line(2)]),group('Distribution',[line(2),line(3)],{pax:9})];
 const single=await f.one("SELECT id FROM rooms WHERE type='Single' LIMIT 1");requests.push(group('Capacity',[line(single.id,{pax:2})]));
 for(const input of requests){assert.notEqual((await f.post('groupCreate',input)).status,200,input.name);assert.deepEqual(await snapshot(f,tables),before,input.name);}
 assert.equal((await f.post('block',{room:3,start:'2026-11-01',end:'2026-11-03',reason:'Mantenimiento',responsible:'spoof'})).status,200);
 assert.notEqual((await f.post('groupCreate',group('Maintenance',[line(2),line(3)]))).status,200);assert.deepEqual(await snapshot(f,tables),before);
});

test('simultaneous overlapping groups have one winner and consecutive stays remain available',async t=>{
 const f=await fixture(t),before=await f.count('bookings'),customers=await f.count('customers');
 const results=await Promise.all([f.post('groupCreate',group('First',[line(2),line(3)])),f.post('groupCreate',group('Second',[line(2),line(4)]))]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(await f.count('reservation_groups'),1);assert.equal(await f.count('group_bookings'),2);assert.equal(await f.count('bookings'),before+2);assert.equal(await f.count('customers'),customers+1);
 assert.equal((await f.post('groupCreate',group('Next',[line(2,{start:'2026-11-03',end:'2026-11-05'})]))).status,200);
});

test('existing reservations keep contacts, terms and money; unlinking does not cancel or release a room and all changes retain history',async t=>{
 const f=await fixture(t);const saved=await f.post('booking',{...line(2),guest:'Individual Contact'});assert.equal(saved.status,200);
 const booking=await f.one("SELECT * FROM bookings WHERE guest='Individual Contact'");
 assert.equal((await f.post('payment',{date:'2026-11-01',booking:booking.id,amount:25,account:'Efectivo'})).status,200);
 const tables=['bookings','booking_terms','booking_clients','sales','cash_movements','room_nights','booking_guests'];const before=await snapshot(f,tables);
 assert.equal((await f.post('groupSave',{name:'Existing group',pax:1,customer:{name:'Organizer'},bookings:[booking.id]})).status,200);assert.deepEqual(await snapshot(f,tables),before);
 const existing=await f.one("SELECT * FROM reservation_groups WHERE name='Existing group'");
 assert.equal((await f.post('groupSave',{id:existing.id,version:0,name:'Renamed group',pax:2,note:'Note',customerId:existing.customer})).status,200);assert.deepEqual(await snapshot(f,tables),before);
 assert.equal((await f.post('groupMembers',{id:existing.id,version:1,bookings:[booking.id],active:false,reason:'Reserva individual'})).status,200);assert.deepEqual(await snapshot(f,tables),before);
 assert.notEqual((await f.post('booking',{...line(2),guest:'Still blocked'})).status,200);
 assert.equal((await f.post('groupMembers',{id:existing.id,version:1,bookings:[booking.id],active:true,reason:'Stale'})).status,409);
 assert.equal((await f.post('groupMembers',{id:existing.id,version:2,bookings:[booking.id],active:true,reason:'Return to group'})).status,200);
 assert.equal((await f.one("SELECT count(*) n FROM audit_log WHERE action IN ('groupSave','groupMembers')")).n,4);
 assert.equal((await f.one('SELECT active FROM group_bookings WHERE booking=?',booking.id)).active,1);
 const two=await f.post('groupSave',{name:'Other group',pax:1,customer:{name:'Another organizer'},bookings:[booking.id]});assert.notEqual(two.status,200);assert.equal(await f.count('reservation_groups'),1);
});

test('group endpoints enforce nested price and discount permissions; group views do not expose finances to kitchen or custom readers',async t=>{
 const f=await fixture(t),post=await asReception(f);
 assert.equal((await post('groupCreate',group('No price rights',[line(2)]))).status,403);
 const tariff=group('No discount',[line(2,{priceMode:'Tarifa',discountType:'Importe',discountValue:1,benefit:'Descuento'})]);assert.equal((await post('groupCreate',tariff)).status,403);
 await f.post('groupCreate',group('Visible',[line(2,{amount:123.45})]));
 await f.post('rolePermissions',{id:'reception',version:1,permissions:['reservations.view']});
 const denied=await post('groupSave',{name:'Forbidden',pax:1,customer:{name:'Not permitted'},bookings:['demo-1']});assert.equal(denied.status,403);
 const request=new Request('http://localhost/api/hotel',{headers:{Cookie:(await f.auth.login(f.authRequest('/api/auth/login',{email:'group@example.test',password:testPassword}))).headers.get('set-cookie').split(';')[0]}});
 const data=await(await f.api.GET(request)).json();assert.equal(data.reservation_groups.length,1);assert.ok(data.bookings.every(b=>!('amount' in b)));assert.deepEqual(data.cash_movements,[]);assert.deepEqual(data.booking_terms,[]);assert.ok(!data.audit_log.some(log=>log.action==='groupCreate'));
 await f.post('rolePermissions',{id:'reception',version:2,permissions:['meals.view']});const kitchen=await(await f.api.GET(request)).json();assert.deepEqual(kitchen.reservation_groups,[]);assert.deepEqual(kitchen.group_bookings,[]);
});

test('group migration only adds empty tables and preserves existing reservations, prices, access and money',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')&&file<'0013').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 db.exec("INSERT INTO rooms VALUES (90,'Doble','Limpia',''); INSERT INTO bookings VALUES ('existing','Historical','',90,'2026-11-01','2026-11-03',2,'Desayuno','Cena',12345,'Confirmada','Directa','Keep'); INSERT INTO booking_terms(booking,base_amount) VALUES ('existing',12345);");
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name),before=new Map(tables.map(table=>[table,db.prepare('SELECT * FROM "'+table+'"').all()]));
 db.exec(readFileSync('drizzle/0013_aromatic_tusk.sql','utf8'));
 for(const table of tables)assert.deepEqual(db.prepare('SELECT * FROM "'+table+'"').all(),before.get(table),table);
 assert.equal(db.prepare('SELECT count(*) n FROM reservation_groups').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('group list and reservation detail use explicit labels and keep financial data behind permissions',async t=>{
 const f=await fixture(t);await f.post('groupCreate',group('Contingente Test',[line(2)]));const data=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const {ReservationGroups}=loadUi(f,'modules/reservations/groups-screen.tsx'),{ReservationDetail}=loadUi(f,'modules/reservations/detail.tsx'),{AccessProvider}=loadUi(f,'modules/access/context.tsx');
 const identity={id:'ui',name:'Reader',email:'ui@example.test',roles:[],permissions:['reservations.view']};
 const html=renderToStaticMarkup(React.createElement(AccessProvider,{identity},React.createElement(ReservationGroups,{data,date:'2026-11-01',onSave:async()=>{},onBooking:()=>{}})));
 assert.ok(!html.includes('Nuevo grupo'));assert.ok(html.includes('Contingente Test'));assert.ok(!html.includes('Saldo del grupo'));
 const booking=data.bookings.find(b=>data.group_bookings.some(link=>link.booking===b.id));const noop=()=>{};
 const detail=renderToStaticMarkup(React.createElement(AccessProvider,{identity},React.createElement(ReservationDetail,{data,booking,date:'2026-11-01',busy:false,onEdit:noop,onStatus:noop,onCancel:noop,onPayment:noop,onSale:noop,onBarter:noop,onSaveMeals:async()=>{}})));
 assert.ok(detail.includes('Contingente Test'));assert.ok(!detail.includes('Saldo pendiente'));
});
