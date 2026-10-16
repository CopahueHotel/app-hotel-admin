import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture,testPassword} from './helpers/hotel-fixture.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadUi} from './helpers/hotel-ui.mjs';
const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
async function setup(t,name='Moved Guest',pax=1){
 const f=await fixture(t),today=f.load('modules/meals/domain.ts').hotelDate(),start=shift(today,-2),end=shift(today,3);
 const rooms=(await f.raw.prepare("SELECT r.id FROM rooms r WHERE r.type='Doble' AND NOT EXISTS(SELECT 1 FROM room_nights n WHERE n.room=r.id AND n.date>=? AND n.date<?) ORDER BY id LIMIT 4").bind(start,end).all()).results.map(r=>r.id);
 const input={guest:name,room:rooms[0],start,end,pax,regime:'Desayuno',meal:'Cena',source:'Directa',priceMode:'Acordado',amount:100,reason:'Acuerdo local de prueba',responsible:'Spoof'};
 assert.equal((await f.post('booking',input)).status,200);
 const booking=await f.one('SELECT * FROM bookings WHERE guest=?',name);
 return {...f,today,start,end,rooms,booking,input};
}
const getData=async f=>(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
const financial=async f=>({booking:await f.one('SELECT * FROM bookings WHERE id=?',f.booking.id),terms:await f.one('SELECT * FROM booking_terms WHERE booking=?',f.booking.id),cash:(await f.raw.prepare('SELECT * FROM cash_movements ORDER BY id').all()).results,sales:(await f.raw.prepare('SELECT * FROM sales ORDER BY id').all()).results,contact:await f.one('SELECT * FROM booking_clients WHERE booking=?',f.booking.id)});
const move=(f,extra={})=>({id:f.booking.id,room:f.rooms[1],version:0,mode:'Completa',reason:'Cambio solicitado',...extra});

test('whole reservation moves keep dates, saved price, contact and payments; retries are idempotent',async t=>{
 const f=await setup(t);await f.post('payment',{date:f.today,booking:f.booking.id,amount:25,account:'Efectivo'});
 const before=await financial(f),key=crypto.randomUUID(),request=move(f,{amount:999999,actor:'Spoof'});
 assert.equal((await f.post('roomMove',request,key)).status,200);assert.equal((await f.post('roomMove',request,key)).status,200);
 const after=await financial(f);assert.deepEqual(after,{...before,booking:{...before.booking,room:f.rooms[1]}});
 assert.equal((await f.one('SELECT count(*) n FROM room_nights WHERE booking=? AND room=?',f.booking.id,f.rooms[1])).n,5);
 assert.equal((await f.one('SELECT count(*) n FROM room_nights WHERE booking=? AND room=?',f.booking.id,f.rooms[0])).n,0);
 const event=await f.one('SELECT * FROM booking_room_moves WHERE booking=?',f.booking.id);assert.equal(event.actor_id,'test-admin');assert.equal(event.actor,'Test Administrator');assert.equal(event.date,f.start);assert.equal((await f.one('SELECT state FROM rooms WHERE id=?',f.rooms[0])).state,'Limpia');
});

test('mid-stay transfer retains past nights, one stay and financial movements; kitchen follows the room for each hotel date',async t=>{
 const f=await setup(t);await f.post('status',{id:f.booking.id,status:'Alojado'});await f.post('payment',{date:f.today,booking:f.booking.id,amount:25,account:'Efectivo'});
 const before=await financial(f);assert.equal((await f.post('roomMove',move(f,{mode:'Traslado',date:f.today}))).status,200);assert.deepEqual(await financial(f),before);
 const data=await getData(f),helpers=f.load('modules/reservations/room-plan.ts');assert.equal(helpers.roomAtDate(data,f.booking,f.start),f.rooms[0]);assert.equal(helpers.roomAtDate(data,f.booking,f.today),f.rooms[1]);assert.equal(helpers.roomAtDate(data,f.booking,f.end),f.rooms[1]);
 assert.deepEqual(JSON.parse(data.booking_room_plans.find(p=>p.booking===f.booking.id).segments),[{room:f.rooms[0],start:f.start,end:f.today},{room:f.rooms[1],start:f.today,end:f.end}]);
 const food=f.load('modules/meals/domain.ts');assert.equal(food.kitchenRows(data,f.start,'Desayuno').find(row=>row.booking===f.booking.id).room,String(f.rooms[0]));assert.equal(food.kitchenRows(data,f.today,'Desayuno').find(row=>row.booking===f.booking.id).room,String(f.rooms[1]));
 assert.equal((await f.one('SELECT state FROM rooms WHERE id=?',f.rooms[0])).state,'Pendiente de limpieza');
 assert.equal((await f.post('booking',{...f.input,guest:'Next stay',start:f.today,room:f.rooms[0]})).status,200);
 assert.notEqual((await f.post('booking',{...f.input,guest:'Past collision',end:f.today,room:f.rooms[0]})).status,200);
 assert.equal((await f.post('block',{room:f.rooms[0],start:shift(f.end,1),end:shift(f.end,2),reason:'Libre después',responsible:'Spoof'})).status,200);
});

test('unavailable destinations, maintenance, capacity, bad dates and stale versions preserve all occupancy and prices',async t=>{
 const f=await setup(t,'Capacity Guest',2);
 const single=await f.one("SELECT id FROM rooms WHERE type='Single' LIMIT 1");const plan=await f.one('SELECT * FROM booking_room_plans WHERE booking=?',f.booking.id),before=await financial(f);
 await f.post('block',{room:f.rooms[1],start:f.start,end:f.end,reason:'Mantenimiento',responsible:'Spoof'});
 for(const request of [move(f),move(f,{room:single.id}),move(f,{version:9,room:f.rooms[2]}),move(f,{mode:'Traslado',date:f.today,room:f.rooms[2]})]){assert.notEqual((await f.post('roomMove',request)).status,200);assert.deepEqual(await financial(f),before);assert.deepEqual(await f.one('SELECT * FROM booking_room_plans WHERE booking=?',f.booking.id),plan);}
 await f.post('status',{id:f.booking.id,status:'Alojado'});assert.notEqual((await f.post('roomMove',move(f,{mode:'Traslado',room:f.rooms[2],date:shift(f.today,1)}))).status,200);
 assert.equal(await f.count('booking_room_moves'),0);
});

test('simultaneous moves and stale edits have one winner and no partial room cleanup or overwritten history',async t=>{
 const f=await setup(t);const results=await Promise.all([f.post('roomMove',move(f)),f.post('roomMove',move(f,{room:f.rooms[2]}))]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(await f.count('booking_room_moves'),1);
 const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',f.booking.id);const edit={...f.input,id:f.booking.id,version:terms.version,roomVersion:0,priceMode:'Conservar'};
 assert.equal((await f.post('bookingEdit',edit)).status,409);assert.equal(await f.count('booking_room_moves'),1);
 const plan=await f.one('SELECT * FROM booking_room_plans WHERE booking=?',f.booking.id);assert.equal(plan.version,1);assert.equal((await f.one('SELECT count(*) n FROM room_nights WHERE booking=?',f.booking.id)).n,5);
});

test('two different stays cannot move to the same room simultaneously',async t=>{
 const f=await setup(t);await f.post('booking',{...f.input,guest:'Second movable',room:f.rooms[2]});const other=await f.one("SELECT * FROM bookings WHERE guest='Second movable'");
 const results=await Promise.all([f.post('roomMove',move(f)),f.post('roomMove',move(f,{id:other.id}))]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(await f.count('booking_room_moves'),1);
 assert.equal((await f.one('SELECT count(*) n FROM room_nights WHERE room=? AND date>=? AND date<?',f.rooms[1],f.start,f.end)).n,5);
});

test('multiple transfers retain chronology, allow old-room maintenance, preserve general edits and clean the actual last room on checkout',async t=>{
 const f=await setup(t);await f.post('status',{id:f.booking.id,status:'Alojado'});
 assert.equal((await f.post('roomMove',move(f,{mode:'Traslado',date:shift(f.today,-1)}))).status,200);
 assert.equal((await f.post('room',{room:f.rooms[0],state:'Fuera de servicio',note:'Reparar'})).status,200);
 assert.equal((await f.post('roomMove',move(f,{mode:'Traslado',version:1,room:f.rooms[2],date:f.today}))).status,200);
 assert.notEqual((await f.post('roomMove',move(f,{mode:'Traslado',version:2,room:f.rooms[1],date:shift(f.today,-1)}))).status,200);
 const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',f.booking.id);
 const edit={...f.input,id:f.booking.id,version:terms.version,roomVersion:2,priceMode:'Conservar',note:'Nota sin cambiar tramos'};assert.equal((await f.post('bookingEdit',edit)).status,200);
 const nextPlan=await f.one('SELECT * FROM booking_room_plans WHERE booking=?',f.booking.id);assert.equal(JSON.parse(nextPlan.segments).length,3);
 assert.notEqual((await f.post('bookingEdit',{...edit,version:terms.version+1,roomVersion:nextPlan.version,end:shift(f.end,1),priceMode:'Acordado'})).status,200);
 await f.post('room',{room:f.rooms[1],state:'Limpia',note:''});await f.post('payment',{date:f.today,booking:f.booking.id,amount:100,account:'Efectivo'});
 assert.equal((await f.post('status',{id:f.booking.id,status:'Finalizada'})).status,200);assert.equal((await f.one('SELECT state FROM rooms WHERE id=?',f.rooms[2])).state,'Pendiente de limpieza');assert.equal((await f.one('SELECT state FROM rooms WHERE id=?',f.rooms[1])).state,'Limpia');
});

test('database rejects gaps, duplicate room assignments and rewriting split occupancy through the original booking',async t=>{
 const f=await setup(t);await f.post('status',{id:f.booking.id,status:'Alojado'});await f.post('roomMove',move(f,{mode:'Traslado',date:f.today}));
 const before=await f.one('SELECT * FROM booking_room_plans WHERE booking=?',f.booking.id);
 await assert.rejects(f.raw.prepare('UPDATE booking_room_plans SET segments=?,version=version+1 WHERE booking=?').bind(JSON.stringify([{room:f.rooms[0],start:f.start,end:shift(f.today,-1)},{room:f.rooms[1],start:f.today,end:f.end}]),f.booking.id).run());
 await assert.rejects(f.raw.prepare('UPDATE bookings SET room=? WHERE id=?').bind(f.rooms[2],f.booking.id).run());
 assert.deepEqual(await f.one('SELECT * FROM booking_room_plans WHERE booking=?',f.booking.id),before);
 await assert.rejects(f.raw.prepare('DELETE FROM booking_room_moves WHERE booking=?').bind(f.booking.id).run());
});

test('room moves require editing permission and expose no financial data to room-only readers',async t=>{
 const f=await setup(t),hash=await f.load('modules/access/passwords.ts').hashPassword(testPassword);
 await f.raw.prepare('INSERT INTO users(id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').bind('room-reader','Reader','reader@example.test','["partner"]',hash).run();
 const login=await f.auth.login(f.authRequest('/api/auth/login',{email:'reader@example.test',password:testPassword})),cookie=login.headers.get('set-cookie').split(';')[0];
 const denied=await f.api.POST(f.authRequest('/api/hotel',{action:'roomMove',data:move(f)},{Cookie:cookie,'Idempotency-Key':crypto.randomUUID()}));assert.equal(denied.status,403);
 await f.post('rolePermissions',{id:'partner',version:0,permissions:['rooms.view']});const body=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:cookie}}))).json();assert.ok(body.booking_room_plans.length>0);assert.deepEqual(body.booking_room_moves,[]);assert.ok(body.bookings.every(b=>!('amount' in b)));assert.deepEqual(body.cash_movements,[]);
});

test('room plan migration conserves every original table, night and price and does not invent transfer authors',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')&&file<'0014').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 db.exec("INSERT INTO rooms VALUES (90,'Doble','Limpia',''); INSERT INTO bookings VALUES ('previous','Historical','',90,'2026-11-01','2026-11-05',1,'Desayuno','Cena',12345,'Confirmada','Directa','Keep');");
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name),before=new Map(tables.map(table=>[table,db.prepare('SELECT * FROM "'+table+'"').all()]));
 db.exec(readFileSync('drizzle/0014_brief_inertia.sql','utf8'));for(const table of tables)assert.deepEqual(db.prepare('SELECT * FROM "'+table+'"').all(),before.get(table),table);
 assert.equal(db.prepare('SELECT count(*) n FROM booking_room_moves').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('calendar shows each room segment, permits drag only for confirmed editable reservations and offers a button alternative',async t=>{
 const f=await setup(t);await f.post('status',{id:f.booking.id,status:'Alojado'});await f.post('roomMove',move(f,{mode:'Traslado',date:f.today}));await f.post('booking',{...f.input,guest:'Confirmed draggable',room:f.rooms[2]});const data=await getData(f);
 const {CalendarScreen}=loadUi(f,'modules/rooms/screen.tsx'),{ReservationDetail}=loadUi(f,'modules/reservations/detail.tsx'),{AccessProvider}=loadUi(f,'modules/access/context.tsx'),noop=()=>{};
 const identity={id:'ui',name:'Operator',email:'ui@example.test',roles:[],permissions:['rooms.view','reservations.view','reservations.edit']};
 const html=renderToStaticMarkup(React.createElement(AccessProvider,{identity},React.createElement(CalendarScreen,{data,rooms:data.rooms,active:data.bookings,calendar:f.start,date:f.today,open:noop,setCalendar:noop,setDetail:noop,blockFor:()=>undefined,onMove:noop})));
 assert.ok(html.includes('Arrastrar para cambiar habitación sin cambiar fechas'));assert.ok(html.includes(`Hab. ${f.rooms[0]}`));assert.ok(html.includes(`Hab. ${f.rooms[1]}`));assert.ok(html.includes('Cambiar habitación'));
 const detail=renderToStaticMarkup(React.createElement(AccessProvider,{identity},React.createElement(ReservationDetail,{data,booking:f.booking,date:f.today,busy:false,onEdit:noop,onStatus:noop,onCancel:noop,onPayment:noop,onSale:noop,onBarter:noop,onSaveMeals:async()=>{},onMove:noop})));
 assert.ok(detail.includes('Habitaciones de la estadía'));assert.ok(detail.includes('Cambiar habitación'));assert.ok(!detail.includes('Saldo pendiente'));
});
