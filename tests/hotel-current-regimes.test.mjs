import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture} from './helpers/hotel-fixture.mjs';

test('Sin desayuno has a saved nightly price but no included meals; explicit additional meals remain possible',async t=>{
 const f=await fixture(t);
 const rate={type:'Doble',regime:'Sin desayuno',start:'2026-11-01',end:'2026-11-02',amount:100,responsible:'ignored'};
 assert.equal((await f.post('rate',rate)).status,200);
 assert.equal((await f.post('booking',{guest:'Sin comidas',room:2,start:'2026-11-01',end:'2026-11-03',pax:2,regime:'Sin desayuno',meal:'Cena',source:'Directa'})).status,200);
 const b=await f.one("SELECT * FROM bookings WHERE guest='Sin comidas'");assert.equal(b.amount,20000);
 const guest=await f.one('SELECT id FROM booking_guests WHERE booking=? ORDER BY position LIMIT 1',b.id);
 const domains=f.load('modules/meals/domain.ts');
 for(const service of ['Desayuno','Almuerzo','Cena']){
  assert.equal(domains.mealIncluded(b,'2026-11-01',service,[]),false);
  assert.equal((await f.post('mealServe',{booking:b.id,guests:[guest.id],date:'2026-11-01',service,responsible:'ignored'})).status,400);
 }
 await assert.rejects(f.raw.prepare("INSERT INTO sales (id,date,booking,customer,label,qty,amount,kind,product,account,service) VALUES ('bypass','2026-11-01',?,'Test','Desayuno',1,0,'Incluida',NULL,NULL,'Desayuno')").bind(b.id).run(),/no esta incluida/);
 assert.equal((await f.post('mealPlan',{guest:guest.id,customer:b.guest,date:'2026-11-01',service:'Desayuno',qty:1,responsible:'ignored'})).status,200);
 const data=await (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();
 const row=domains.kitchenRows(data,'2026-11-01','Desayuno').find(r=>r.guest===guest.id);assert.equal(row.character,'Adicional');assert.equal(row.expected,1);
 const saved=await f.one('SELECT snapshot FROM booking_terms WHERE booking=?',b.id);
 const r=await f.one("SELECT * FROM room_rates WHERE regime='Sin desayuno'");
 assert.equal((await f.post('rate',{...rate,id:r.id,version:0,amount:150})).status,200);
 assert.equal((await f.one('SELECT amount FROM bookings WHERE id=?',b.id)).amount,20000);
 assert.equal((await f.one('SELECT snapshot FROM booking_terms WHERE booking=?',b.id)).snapshot,saved.snapshot);
 assert.equal((await f.post('rate',{...rate,regime:'PC'})).status,400);
 assert.equal((await f.post('booking',{guest:'Obsolete',room:3,start:'2026-11-01',end:'2026-11-03',pax:2,regime:'PC',meal:'Cena',source:'Directa',priceMode:'Acordado',amount:100,reason:'Test'})).status,400);
});

test('the migration preserves historical full-board prices and regimes while enforcing the three current tariff categories',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>!f.startsWith('0011')))db.exec(readFileSync('drizzle/'+file,'utf8'));
 db.exec("INSERT INTO rooms VALUES (99,'Doble','Limpia',''); INSERT INTO bookings VALUES ('history','History','',99,'2026-11-01','2026-11-03',1,'PC','Cena',12345,'Confirmada','Directa',''); INSERT INTO booking_terms (booking,base_amount) VALUES ('history',12345); INSERT INTO room_rates (id,type,regime,start,end,amount,responsible,note) VALUES ('old','Doble','PC','2026-11-01','2026-11-03',6000,'Historical','');");
 const before=db.prepare('SELECT * FROM bookings').all(),terms=db.prepare('SELECT * FROM booking_terms').all(),rates=db.prepare('SELECT * FROM room_rates').all();
 db.exec(readFileSync('drizzle/0011_current_hotel_regimes.sql','utf8'));
 assert.deepEqual(db.prepare('SELECT * FROM bookings').all(),before);assert.deepEqual(db.prepare('SELECT * FROM booking_terms').all(),terms);assert.deepEqual(db.prepare('SELECT * FROM room_rates').all(),rates);
 db.exec("UPDATE room_rates SET version=1,note='Historical retained' WHERE id='old'");
 assert.throws(()=>db.exec("INSERT INTO room_rates (id,type,regime,start,end,amount,responsible) VALUES ('new-pc','Single','PC','2026-11-01','2026-11-03',0,'Admin')"),/HOT_RATE_INVALID/);
 db.exec("INSERT INTO sales (id,date,booking,customer,label,qty,amount,kind,service) VALUES ('old-breakfast','2026-11-01','history','History','Desayuno',1,0,'Incluida','Desayuno')");
 assert.equal(db.prepare('SELECT count(*) n FROM sales').get().n,1);
});
