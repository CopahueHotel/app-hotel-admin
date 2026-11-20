import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixture,testPassword} from './helpers/hotel-fixture.mjs';
import {loadUi} from './helpers/hotel-ui.mjs';
const date='2026-10-03',pdf={name:'factura.pdf',mime:'application/pdf',content:Buffer.from('%PDF-1.4\n% synthetic test\n%%EOF').toString('base64')};
const draft={date,due:'',supplier:'Test supplier',invoice:'TEST-1',label:'Test service',area:'Hotel',kind:'Variable',type:'Servicio',category:'Internet',amount:100,received:false,lines:[],responsible:'Spoof',observation:'Original'};
async function create(f,extra={}){const result=await f.post('purchaseDocument',{...draft,...extra});assert.equal(result.status,200,JSON.stringify(result));return f.one('SELECT * FROM expenses ORDER BY rowid DESC LIMIT 1');}
const edit=(e,extra={})=>({...draft,expense:e.id,version:0,reason:'Corregir error de carga',...extra});
async function snapshot(f,id){return {expense:await f.one('SELECT * FROM expenses WHERE id=?',id),document:await f.one('SELECT * FROM purchase_documents WHERE expense=?',id),lines:(await f.raw.prepare('SELECT * FROM purchase_lines WHERE expense=? ORDER BY id').bind(id).all()).results,version:await f.one('SELECT * FROM purchase_versions WHERE expense=?',id),stock:await f.count('stock_movements'),cash:await f.count('cash_movements'),files:await f.count('purchase_attachments')};}

test('files are private, validated, audited without contents, atomic on creation and included in payment history',async t=>{
 const f=await fixture(t),before=await f.count('expenses');
 for(const file of [{...pdf,mime:'image/png'},{...pdf,content:'AAAA'},{...pdf,content:Buffer.alloc(1024*1024+1).toString('base64')}])assert.notEqual((await f.post('purchaseDocument',{...draft,files:[file]})).status,200);
 assert.equal(await f.count('expenses'),before);
 const e=await create(f,{files:[pdf]}),a=await f.one('SELECT * FROM purchase_attachments WHERE expense=?',e.id);
 assert.equal(a.actor_id,'test-admin');assert.equal(a.actor,'Test Administrator');assert.equal(a.cash,null);
 const audit=await f.one("SELECT * FROM audit_log WHERE action='purchaseDocument' ORDER BY rowid DESC LIMIT 1");assert.ok(!audit.detail.includes(pdf.content));assert.ok(audit.detail.includes('factura.pdf'));
 const data=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();assert.ok(!('content' in data.purchase_attachments[0]));
 const route=f.load('app/api/hotel/purchase-attachment/route.ts'),url='http://localhost/api/hotel/purchase-attachment?id='+a.id;
 assert.equal((await route.GET(new Request(url))).status,401);
 const response=await route.GET(new Request(url,{headers:{Cookie:f.cookie}}));assert.equal(response.status,200);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(response.headers.get('Content-Disposition'),/^attachment;/);assert.equal(await response.text(),Buffer.from(pdf.content,'base64').toString());
 assert.equal((await f.post('supplierPay',{expense:e.id,date,amount:20,account:'Efectivo',reference:'Test transfer',files:[pdf],responsible:'Spoof'})).status,200);
 const proof=await f.one('SELECT * FROM purchase_attachments WHERE cash IS NOT NULL');assert.equal(proof.expense,e.id);assert.equal((await f.one('SELECT amount FROM cash_movements WHERE id=?',proof.cash)).amount,-2000);
 await assert.rejects(f.raw.prepare('DELETE FROM purchase_attachments WHERE id=?').bind(a.id).run());
 const saved=await snapshot(f,e.id);assert.notEqual((await f.post('supplierPay',{expense:e.id,date,amount:10,account:'Efectivo',files:[{...pdf,content:'AAAA'}],responsible:'Spoof'})).status,200);assert.deepEqual(await snapshot(f,e.id),saved);
});

test('editing a paid expense preserves movements, author, previous values and idempotency; rejects overpayment and stale edits',async t=>{
 const f=await fixture(t),e=await create(f);await f.post('supplierPay',{expense:e.id,date,amount:50,account:'Efectivo',responsible:'Spoof'});
 const before=await snapshot(f,e.id),request=edit(e,{amount:120,invoice:'TEST-2',observation:'Corrected',files:[pdf]}),key=crypto.randomUUID();
 assert.equal((await f.post('purchaseEdit',request,key)).status,200);assert.equal((await f.post('purchaseEdit',request,key)).status,200);
 const after=await snapshot(f,e.id);assert.equal(after.expense.amount,12000);assert.equal(after.cash,before.cash);assert.equal(after.stock,before.stock);assert.equal(after.document.responsible,before.document.responsible);assert.equal(after.document.invoice,'TEST-2');assert.equal(after.version.version,1);assert.equal(after.files,1);
 const audit=await f.one("SELECT * FROM audit_log WHERE action='purchaseEdit' ORDER BY rowid DESC LIMIT 1"),detail=JSON.parse(audit.detail);assert.equal(detail.before.expense.amount,10000);assert.equal(detail.after.expense.amount,12000);assert.equal(audit.actor_id,'test-admin');assert.ok(!audit.detail.includes(pdf.content));
 for(const body of [edit(e,{amount:130}),edit(e,{version:1,amount:40}),edit(e,{version:1,amount:120,date:'2026-10-04'}),edit(e,{version:1,amount:120,area:'Restaurante'})])assert.notEqual((await f.post('purchaseEdit',body)).status,200);
 assert.deepEqual(await snapshot(f,e.id),after);assert.equal(await f.count('purchase_edit_guards'),0);
 const concurrent=await Promise.all([f.post('purchaseEdit',edit(e,{version:1,amount:125})),f.post('purchaseEdit',edit(e,{version:1,amount:130}))]);assert.equal(concurrent.filter(r=>r.status===200).length,1);assert.equal((await f.one('SELECT version FROM purchase_versions WHERE expense=?',e.id)).version,2);
});

test('product corrections respect received quantities, allow unreceived lines to change and never duplicate stock',async t=>{
 const f=await fixture(t),original=[{product:'agua',category:'Bebidas',qty:4,cost:10},{product:'carne',category:'Alimentos',qty:2,cost:5}],e=await create(f,{type:'Productos',lines:original});
 const lines=(await f.raw.prepare('SELECT * FROM purchase_lines WHERE expense=? ORDER BY product').bind(e.id).all()).results;
 const water=lines.find(l=>l.product==='agua');assert.equal((await f.post('purchaseReceive',{expense:e.id,date,lines:[{line:water.id,qty:2}],responsible:'Spoof'})).status,200);
 const inputLines=lines.map(l=>({...l,cost:l.cost/100})),saved=await snapshot(f,e.id);
 for(const changes of [{lines:inputLines.filter(l=>l.product!=='agua')},{lines:inputLines.map(l=>({...l,qty:l.product==='agua'?1:l.qty}))},{type:'Servicio',lines:[]}])assert.notEqual((await f.post('purchaseEdit',edit(e,{type:'Productos',lines:inputLines,...changes}))).status,200);
 assert.deepEqual(await snapshot(f,e.id),saved);
 assert.equal((await f.post('purchaseEdit',edit(e,{type:'Productos',lines:[{...inputLines.find(l=>l.product==='agua'),qty:3,cost:12}]}))).status,200);
 assert.equal((await f.one('SELECT amount FROM expenses WHERE id=?',e.id)).amount,3600);assert.equal(await f.count('stock_movements'),saved.stock);assert.equal(await f.count('purchase_receipts'),1);
 assert.equal((await f.post('purchaseReceive',{expense:e.id,date,lines:[{line:water.id,qty:1}],responsible:'Spoof'})).status,200);
 assert.notEqual((await f.post('purchaseReceive',{expense:e.id,date,lines:[{line:water.id,qty:1}],responsible:'Spoof'})).status,200);
});

test('closed expenses allow documentary corrections and attachments without reopening money or stock',async t=>{
 const f=await fixture(t),e=await create(f),expected=await f.one("SELECT COALESCE(SUM(amount),0) amount FROM cash_movements WHERE account='Efectivo' AND date<=?",date);
 assert.equal((await f.post('close',{date,counted:expected.amount/100,note:'Test close'})).status,200);
 assert.notEqual((await f.post('purchaseEdit',edit(e,{amount:110}))).status,200);
 assert.equal((await f.post('purchaseEdit',edit(e,{invoice:'Fixed number',due:'2026-11-01',observation:'Documentary only'}))).status,200);
 assert.equal((await f.post('purchaseAttach',{expense:e.id,files:[pdf],responsible:'Spoof'})).status,200);assert.equal((await f.one('SELECT amount FROM expenses WHERE id=?',e.id)).amount,10000);
});

test('payments or receipts that arrive during an edit cannot be overwritten by stale validation',async t=>{
 const f=await fixture(t),e=await create(f);let race=true;
 f.setGate(async statements=>{if(race&&statements.some(s=>s.sql==='INSERT INTO purchase_edit_guards VALUES (?,?)')){race=false;assert.equal((await f.post('supplierPay',{expense:e.id,date,amount:90,account:'Efectivo',responsible:'Spoof'})).status,200);}});
 assert.notEqual((await f.post('purchaseEdit',edit(e,{amount:60}))).status,200);f.setGate(null);
 assert.equal((await f.one('SELECT amount FROM expenses WHERE id=?',e.id)).amount,10000);assert.equal(await f.count('purchase_versions'),0);
 const product=await create(f,{type:'Productos',lines:[{product:'agua',qty:4,cost:10,category:'Bebidas'}]}),line=await f.one('SELECT * FROM purchase_lines WHERE expense=?',product.id);race=true;
 f.setGate(async statements=>{if(race&&statements.some(s=>s.sql==='INSERT INTO purchase_edit_guards VALUES (?,?)')){race=false;assert.equal((await f.post('purchaseReceive',{expense:product.id,date,lines:[{line:line.id,qty:2}],responsible:'Spoof'})).status,200);}});
 assert.notEqual((await f.post('purchaseEdit',edit(product,{type:'Productos',lines:[{id:line.id,product:'agua',qty:1,cost:10,category:'Bebidas'}]}))).status,200);f.setGate(null);
 assert.equal((await f.one('SELECT qty FROM purchase_lines WHERE id=?',line.id)).qty,4);assert.equal((await f.one('SELECT sum(qty) qty FROM purchase_receipts WHERE line=?',line.id)).qty,2);assert.equal(await f.count('purchase_edit_guards'),0);
});

test('permissions reject direct edits and downloads for stock and consultation roles; purchase UI explains reception and private documents',async t=>{
 const f=await fixture(t),e=await create(f,{files:[pdf]}),file=await f.one('SELECT id FROM purchase_attachments LIMIT 1'),hash=await f.load('modules/access/passwords.ts').hashPassword(testPassword);
 await f.raw.prepare('INSERT INTO users(id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').bind('stock-reader','Stock','stock@example.test','["supply"]',hash).run();
 const login=await f.auth.login(f.authRequest('/api/auth/login',{email:'stock@example.test',password:testPassword})),cookie=login.headers.get('set-cookie').split(';')[0];
 const request=(action,data)=>f.api.POST(f.authRequest('/api/hotel',{action,data},{Cookie:cookie,'Idempotency-Key':crypto.randomUUID()}));
 assert.equal((await request('purchaseEdit',edit(e))).status,403);assert.equal((await request('purchaseAttach',{expense:e.id,files:[pdf],responsible:'Spoof'})).status,403);
 const attachment=f.load('app/api/hotel/purchase-attachment/route.ts');assert.equal((await attachment.GET(new Request('http://localhost/api/hotel/purchase-attachment?id='+file.id,{headers:{Cookie:cookie}}))).status,403);
 const data=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json(),stockData=await(await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:cookie}}))).json();assert.deepEqual(stockData.purchase_attachments,[]);
 const {Purchases}=loadUi(f,'modules/purchases/screen.tsx'),html=renderToStaticMarkup(React.createElement(Purchases,{data,date,onSave:async()=>{}}));
 for(const text of ['Registrar gasto','No requiere recepción de mercadería','Subir comprobante','Editar','factura.pdf'])assert.ok(html.includes(text),text);assert.ok(!html.includes('Sin stock'));
 const {Editor}=loadUi(f,'modules/shared/supply-ui.tsx'),editor=renderToStaticMarkup(React.createElement(Editor,{title:'Gasto',date,onCancel:()=>{},onSubmit:async()=>{},observationLast:true},React.createElement('input',{name:'concept'})));
 assert.ok(editor.indexOf('name="concept"')<editor.indexOf('name="observation"'));
});

test('migration retains existing operational rows and grants edit only to default management roles',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0018').sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
  db.exec("INSERT INTO expenses VALUES('old','2026-10-03','','Old supplier','Original','Hotel','Internet',12345,'Variable'); INSERT INTO purchase_documents VALUES('old','OLD-1','Servicio','Historical author','Keep');");
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name).filter(n=>!['roles','access_state'].includes(n)),before=new Map(names.map(n=>[n,db.prepare('SELECT * FROM "'+n+'"').all()]));
  db.exec(readFileSync('drizzle/0018_special_zeigeist.sql','utf8'));for(const name of names)assert.deepEqual(db.prepare('SELECT * FROM "'+name+'"').all(),before.get(name),name);
  for(const role of ['administration','manager'])assert.ok(JSON.parse(db.prepare('SELECT permissions FROM roles WHERE id=?').get(role).permissions).includes('purchases.edit'));
  for(const role of ['partner','supply'])assert.ok(!JSON.parse(db.prepare('SELECT permissions FROM roles WHERE id=?').get(role).permissions).includes('purchases.edit'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
