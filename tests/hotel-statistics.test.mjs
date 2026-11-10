import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixture,testPassword} from './helpers/hotel-fixture.mjs';
import {loadUi} from './helpers/hotel-ui.mjs';

const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>load(name.slice(2)+'.ts'),exports);return exports;}
const {hotelStatistics}=load('modules/reports/statistics.ts');
const booking=(id,extra={})=>({id,start:'2026-10-31',end:'2026-11-03',pax:2,status:'Finalizada',regime:'MP',source:'WhatsApp',group_id:null,locality:'',province:'',country:'',...extra});
const night=(booking,date,room=1)=>({booking,date,room});
const base=()=>({rooms:[{id:1,state:'Limpia'},{id:2,state:'Limpia'}],blocks:[],bookings:[],nights:[]});

test('monthly statistics count ledger nights, month boundaries and transfers once; separate past confirmations and future reservations',()=>{
 const input=base();input.bookings=[booking('stay'),booking('past',{status:'Confirmada'}),booking('future',{start:'2026-11-10',end:'2026-11-12',status:'Confirmada'}),booking('cancelled',{status:'Cancelada'})];
 input.nights=[night('stay','2026-10-31'),night('stay','2026-11-01'),night('stay','2026-11-02',2),night('past','2026-11-03'),night('future','2026-11-10'),night('future','2026-11-11'),night('cancelled','2026-11-04')];
 const actual=hotelStatistics(input,'2026-11','realized','2026-11-10');
 assert.equal(actual.occupied,2);assert.equal(actual.reservations,1);assert.equal(actual.people,2);assert.equal(actual.personNights,4);assert.equal(actual.averageStay,3);assert.equal(actual.days,9);assert.equal(actual.available,18);assert.equal(actual.unreviewed,1);assert.equal(actual.occupancy,100*2/18);
 const future=hotelStatistics(input,'2026-11','forecast','2026-11-10');assert.equal(future.occupied,2);assert.equal(future.days,21);assert.equal(future.reservations,1);assert.equal(future.daily.find(d=>d.date==='2026-11-10').occupied,1);
 assert.equal(actual.daily.find(d=>d.date==='2026-11-10').occupancy,null);
 assert.equal(actual.weekdays.reduce((n,d)=>n+d.nights,0),actual.occupied);assert.equal(actual.weekdays.reduce((n,d)=>n+d.available,0),actual.available);
});

test('availability unions maintenance nights, uses current room state only forward and avoids division by zero',()=>{
 const input=base();input.rooms[0].state='Fuera de servicio';input.blocks=[{room:1,start:'2026-11-01',end:'2026-11-04'},{room:1,start:'2026-11-02',end:'2026-11-05'}];
 const result=hotelStatistics(input,'2026-11','realized','2026-12-01');assert.equal(result.blocked,4);assert.equal(result.capacity,60);assert.equal(result.available,56);
 input.rooms.forEach(room=>room.state='Fuera de servicio');const future=hotelStatistics(input,'2026-11','forecast','2026-11-01');assert.equal(future.available,0);assert.equal(future.occupancy,null);assert.equal(future.bestDays.length,0);
 assert.equal(hotelStatistics(base(),'2028-02','realized','2028-03-01').days,29);
 assert.equal(hotelStatistics(base(),'2026-11','realized','2026-11-01').days,0);
});

test('group, regime, channel and geographic totals match the nights; missing provenance stays explicit',()=>{
 const input=base();input.bookings=[booking('one',{country:' Argentina ',province:'Neuquén',group_id:'group'}),booking('two',{country:'argentina',province:'Neuquén',group_id:'group',pax:1}),booking('three',{source:'Web',regime:'PC'})];
 input.nights=[night('one','2026-11-01'),night('two','2026-11-01',2),night('three','2026-11-02')];
 const data=hotelStatistics(input,'2026-11','realized','2026-12-01');
 assert.equal(data.reservations,3);assert.equal(data.segments.find(r=>r.label==='Grupos').reservations,2);
 assert.equal(data.countries.find(r=>r.label==='Argentina').reservations,2);assert.equal(data.countries.find(r=>r.label==='Sin información').nights,1);
 for(const name of ['countries','provinces','localities','segments','channels','regimes']){assert.equal(data[name].reduce((n,r)=>n+r.nights,0),data.occupied);assert.equal(data[name].reduce((n,r)=>n+r.reservations,0),data.reservations);}
});

test('statistics API enforces session, export and revoked permissions, returns aggregates only and preserves bookings and funds',async t=>{
 const f=await fixture(t),route=f.load('app/api/hotel/statistics/route.ts'),today=f.load('modules/meals/domain.ts').hotelDate(),month=today.slice(0,7),start=month+'-01',end=f.load('modules/shared/dates.ts').shiftDate(start,2);
 const room=await f.one("SELECT id FROM rooms WHERE type='Doble' ORDER BY id LIMIT 1");
 const input={guest:'PRIVATE GUEST',phone:'PRIVATE PHONE',room:room.id,start,end,pax:2,regime:'Desayuno',meal:'Cena',source:'WhatsApp',priceMode:'Acordado',amount:123,reason:'Test',responsible:'Spoof',customer:{name:'PRIVATE GUEST',email:'private@example.test',phone:'',country:'Argentina',province:'Neuquén',locality:'Zapala',origin:'WhatsApp'}};
 assert.equal((await f.post('booking',input)).status,200);const b=await f.one("SELECT * FROM bookings WHERE guest='PRIVATE GUEST'");assert.equal((await f.post('status',{id:b.id,status:'Alojado'})).status,200);
 const before={booking:await f.one('SELECT * FROM bookings WHERE id=?',b.id),cash:await f.count('cash_movements'),sales:await f.count('sales')};
 const url=`http://localhost/api/hotel/statistics?month=${month}&scope=realized`,request=(suffix='',cookie=f.cookie)=>new Request(url+suffix,{headers:cookie?{Cookie:cookie}:{}});
 assert.equal((await route.GET(request('',null))).status,401);
 const response=await route.GET(request()),body=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const text=JSON.stringify(body);for(const secret of ['PRIVATE GUEST','PRIVATE PHONE','private@example.test',b.id,'base_amount','amount','cash_movements'])assert.ok(!text.includes(secret),secret);
 assert.equal((await route.GET(new Request('http://localhost/api/hotel/statistics?month=2026-13',{headers:{Cookie:f.cookie}}))).status,400);
 assert.equal((await route.GET(new Request('http://localhost/api/hotel/statistics?scope=invalid',{headers:{Cookie:f.cookie}}))).status,400);
 const csv=await route.GET(request('&export=csv'));assert.equal(csv.status,200);assert.ok((await csv.text()).includes('Ocupación sobre disponibles'));
 const hash=await f.load('modules/access/passwords.ts').hashPassword(testPassword);
 await f.raw.prepare('INSERT INTO users(id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').bind('report-reader','Reader','reader@example.test','["partner"]',hash).run();
 await f.post('rolePermissions',{id:'partner',version:0,permissions:['reports.view']});
 const login=await f.auth.login(f.authRequest('/api/auth/login',{email:'reader@example.test',password:testPassword})),cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await route.GET(request('',cookie))).status,200);assert.equal((await route.GET(request('&export=csv',cookie))).status,403);
 await f.post('rolePermissions',{id:'partner',version:1,permissions:['meals.view']});assert.equal((await route.GET(request('',cookie))).status,403);
 await f.post('rolePermissions',{id:'partner',version:2,permissions:['reports.view']});
 let changed=false;f.setGate(async statements=>{if(!changed&&statements.some(s=>s.sql==='SELECT id,state FROM rooms')){changed=true;await f.post('rolePermissions',{id:'partner',version:3,permissions:[]});}});
 assert.equal((await route.GET(request('',cookie))).status,403);f.setGate(null);
 assert.deepEqual({booking:await f.one('SELECT * FROM bookings WHERE id=?',b.id),cash:await f.count('cash_movements'),sales:await f.count('sales')},before);
 const {StatisticsOverview}=loadUi(f,'modules/reports/statistics-screen.tsx');const html=renderToStaticMarkup(React.createElement(StatisticsOverview,{data:body}));
 for(const label of ['Ocupación por fecha','Días de la semana','Procedencia del contacto','Grupos e individuales','Sin información'])assert.ok(html.includes(label),label);
});
