import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,testPassword} from './helpers/hotel-fixture.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const stay={room:2,start:'2026-11-01',end:'2026-11-03',pax:2,regime:'Desayuno',meal:'Cena',source:'Directa',priceMode:'Acordado',amount:100,reason:'Precio acordado',responsible:'untrusted'};
async function contacts(f,query='',cookie=f.cookie){return f.load('app/api/hotel/customers/route.ts').GET(new Request('http://localhost/api/hotel/customers'+query,{headers:{Cookie:cookie}}));}
async function user(f,roles,id){
 const hash=await f.load('modules/access/passwords.ts').hashPassword(testPassword);
 await f.raw.prepare('INSERT INTO users (id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').bind(id,id,id+'@example.test',JSON.stringify(roles),hash).run();
 const response=await f.auth.login(f.authRequest('/api/auth/login',{email:id+'@example.test',password:testPassword}));return response.headers.get('set-cookie').split(';')[0];
}
test('a reservation creates its customer atomically; repeat stays reuse the selected contact and central edits preserve historical prices',async t=>{
 const f=await fixture(t),before=await f.count('customers');
 assert.equal((await f.post('booking',{...stay,customer:{name:'Contact One',email:'ONE@example.test',phone:'+54 (11) 1234-5678',origin:'Web'}})).status,200);
 const customer=await f.one("SELECT * FROM customers WHERE name='Contact One'");assert.equal(await f.count('customers'),before+1);assert.equal(customer.email_key,'one@example.test');assert.equal(customer.phone_key,'541112345678');assert.equal(customer.created_by,'test-admin');assert.equal(customer.consent,'Sin información');
 const first=await f.one('SELECT * FROM bookings WHERE id IN (SELECT booking FROM booking_clients WHERE customer=?)',customer.id);
 const price=await f.one('SELECT * FROM booking_terms WHERE booking=?',first.id);
 assert.equal((await f.post('booking',{...stay,start:'2026-11-03',end:'2026-11-05',customerId:customer.id})).status,200);assert.equal(await f.count('customers'),before+1);
 assert.equal((await f.post('customerSave',{...customer,email:'new@example.test',phone:'555',name:'Updated Contact'})).status,200);
 const data=await (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();assert.equal(data.bookings.find(b=>b.id===first.id).guest,'Updated Contact');assert.equal(data.bookings.find(b=>b.id===first.id).phone,'555');
 assert.equal((await f.one('SELECT guest FROM bookings WHERE id=?',first.id)).guest,'Contact One');assert.deepEqual(await f.one('SELECT * FROM booking_terms WHERE booking=?',first.id),price);
 const profile=await (await contacts(f)).json();assert.equal(profile.links.filter(l=>l.customer===customer.id).length,2);assert.ok(profile.audit_log.some(a=>a.customer===customer.id));
});
test('duplicate detection normalizes contacts, requires review and permits different people sharing a contact',async t=>{
 const f=await fixture(t),input={name:'Different people',email:' Shared@EXAMPLE.test ',phone:'0054 (11) 1234'};
 assert.equal((await f.post('customerSave',input)).status,200);
 const match=await(await contacts(f,'?lookup=1&email=shared%40example.test&phone=%2B54%2011%201234')).json();assert.equal(match.customers.length,1);
 assert.equal((await f.post('customerSave',{...input,name:'Second Person'})).status,400);
 assert.equal((await f.post('customerSave',{...input,name:'Second Person',duplicateConfirmed:true})).status,200);
 assert.equal((await f.one("SELECT count(*) n FROM customers WHERE email_key='shared@example.test'")).n,2);
 assert.equal((await f.post('customerSave',{name:'No email or phone'})).status,200);
});
test('inquiries do not create reservations; conversion preserves the customer and failed or simultaneous bookings roll back completely',async t=>{
 const f=await fixture(t);
 await f.post('customerSave',{name:'Inquiry Customer'});const customer=await f.one("SELECT * FROM customers WHERE name='Inquiry Customer'");
 const count=await f.count('bookings');
 assert.equal((await f.post('inquirySave',{customer:customer.id,date:'2026-10-20',channel:'WhatsApp',start:'2026-11-01',end:'2026-11-03',pax:2,status:'Presupuesto enviado',nextAction:'Consultar confirmación',followup:'2026-10-22',notes:'One person asked'})).status,200);
 assert.equal(await f.count('bookings'),count);const inquiry=await f.one('SELECT * FROM customer_inquiries WHERE customer=?',customer.id);
 const request={...stay,customerId:customer.id,inquiryId:inquiry.id,inquiryVersion:0};
 const results=await Promise.all([f.post('booking',request),f.post('booking',{...request,room:3})]);assert.equal(results.filter(r=>r.status===200).length,1);
 assert.equal(await f.count('bookings'),count+1);assert.equal((await f.one('SELECT status FROM customer_inquiries WHERE id=?',inquiry.id)).status,'Convertida en reserva');assert.equal((await f.one('SELECT count(*) n FROM booking_clients WHERE inquiry=?',inquiry.id)).n,1);
 const current=await f.count('customers');assert.equal((await f.post('booking',{...stay,customer:{name:'Failed Contact'},start:'2026-10-01',end:'2026-10-03',room:7})).status,400);assert.equal(await f.count('customers'),current);
 assert.equal((await f.post('inquirySave',{...inquiry,version:1,status:'Nueva consulta'})).status,400);
});
test('promotional consent is explicit and attributed; CSV is permission-protected and contains neither notes nor money',async t=>{
 const f=await fixture(t);
 await f.post('customerSave',{name:'=Formula Contact',email:'export@example.test',notes:'PRIVATE INTERNAL'});const c=await f.one("SELECT * FROM customers WHERE email_key='export@example.test'");
 assert.equal(c.consent,'Sin información');assert.equal((await f.post('customerSave',{...c,consent:'Autorizado'})).status,400);
 assert.equal((await f.post('customerSave',{...c,consent:'Autorizado',consentDate:'2026-10-20',consentSource:'Formulario firmado',updated_by:'spoof'})).status,200);
 assert.equal((await f.one('SELECT consent_by FROM customers WHERE id=?',c.id)).consent_by,'test-admin');
 const csv=await contacts(f,'?export=1&consent=Autorizado');assert.equal(csv.status,200);const body=await csv.text();assert.match(body,/'=Formula Contact/);assert.match(body,/Autorizado/);assert.doesNotMatch(body,/PRIVATE INTERNAL|Precio|Saldo/);
 const kitchen=await user(f,['kitchen'],'customer-kitchen');assert.equal((await contacts(f,'',kitchen)).status,403);assert.equal((await contacts(f,'?lookup=export',kitchen)).status,403);
 const reception=await user(f,['reception'],'customer-reception');assert.equal((await contacts(f,'',reception)).status,200);assert.equal((await contacts(f,'?export=1',reception)).status,403);
 const result=await f.api.POST(f.authRequest('/api/hotel',{action:'customerSave',data:{name:'Forbidden'}},{Cookie:kitchen,'Idempotency-Key':crypto.randomUUID()}));assert.equal(result.status,403);
 await f.post('rolePermissions',{id:'partner',version:0,permissions:['customers.view','customers.edit']});
 const limited=await user(f,['partner'],'customer-no-consent');const current=await f.one('SELECT * FROM customers WHERE id=?',c.id);
 const denied=await f.api.POST(f.authRequest('/api/hotel',{action:'customerSave',data:{...current,consent:'Revocado',consentDate:'2026-10-21',consentSource:'Solicitud'}},{Cookie:limited,'Idempotency-Key':crypto.randomUUID()}));assert.equal(denied.status,403);
 assert.equal((await f.one('SELECT consent FROM customers WHERE id=?',c.id)).consent,'Autorizado');
});
test('lookup can support reservations without full module access; internal notes, finances and exports remain separate',async t=>{
 const f=await fixture(t);await f.post('customerSave',{name:'Lookup Person',email:'lookup@example.test',notes:'NOT FOR LOOKUP'});
 await f.post('rolePermissions',{id:'partner',version:0,permissions:['customers.lookup','reservations.view']});const cookie=await user(f,['partner'],'customer-lookup');
 assert.equal((await contacts(f,'',cookie)).status,403);const response=await contacts(f,'?lookup=lookup',cookie);assert.equal(response.status,200);const body=await response.json();assert.deepEqual(Object.keys(body.customers[0]).sort(),['email','id','name','phone']);
 assert.equal((await contacts(f,'?lookup=1&export=1',cookie)).status,403);
 await f.post('rolePermissions',{id:'partner',version:1,permissions:['customers.view']});const profile=await(await contacts(f,'',cookie)).json();assert.ok(!('notes' in profile.customers.find(c=>c.name==='Lookup Person')));assert.deepEqual(profile.bookings,[]);assert.ok(profile.audit_log.every(a=>!a.detail));
 await f.post('rolePermissions',{id:'partner',version:2,permissions:[]});assert.equal((await contacts(f,'',cookie)).status,403);
});
test('migration preserves bookings and financial history and never merges identical historical names or contacts',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0012').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 db.exec("INSERT INTO rooms VALUES (90,'Doble','Limpia',''); INSERT INTO bookings VALUES ('a','Same name','+54 11 1234',90,'2026-11-01','2026-11-03',1,'Desayuno','Cena',10000,'Confirmada','Booking','Stay A'); INSERT INTO bookings VALUES ('b','Same name','+54 11 1234',90,'2026-11-03','2026-11-05',1,'Desayuno','Cena',20000,'Confirmada','Booking','Stay B'); INSERT INTO booking_terms (booking,base_amount) VALUES ('a',10000),('b',20000); UPDATE roles SET permissions='[\"panel.view\"]',version=1 WHERE id='reception';");
 const before=db.prepare('SELECT * FROM bookings ORDER BY id').all(),prices=db.prepare('SELECT * FROM booking_terms ORDER BY booking').all();
 db.exec(readFileSync('drizzle/0012_magenta_runaways.sql','utf8'));
 assert.deepEqual(db.prepare('SELECT * FROM bookings ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM booking_terms ORDER BY booking').all(),prices);assert.equal(db.prepare('SELECT count(*) n FROM customers').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM booking_clients').get().n,2);
 assert.equal(db.prepare("SELECT count(*) n FROM customers WHERE created_by IS NULL AND consent='Sin información' AND phone_key='54111234'").get().n,2);assert.equal(db.prepare("SELECT permissions FROM roles WHERE id='reception'").get().permissions,'["panel.view"]');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
