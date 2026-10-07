import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/hotel-fixture.mjs';
const date='2026-10-03',who={responsible:'Operador de prueba',observation:'Sólo datos de prueba'};
const dispatch={date,time:'13:25',product:'agua',qty:2,price:12.34,destination:'Mesa',mode:'Pendiente',customer:'Mesa de prueba',account:'Banco',...who};
const doc={date,due:'',supplier:'Proveedor de prueba',invoice:'TEST-1',label:'Compra de prueba',area:'Restaurante',kind:'Variable',type:'Productos',category:'Productos',lines:[{product:'agua',category:'Bebidas',qty:4,cost:2.50},{product:'carne',category:'Alimentos',qty:1.5,cost:10.01}],...who};
async function account(f){assert.equal((await f.post('beverageAccount',{table:'Mesa 1',date,time:'12:00',...who})).status,200);return (await f.one('SELECT id FROM beverage_accounts ORDER BY rowid DESC LIMIT 1')).id;}
async function send(f,changes={}){assert.equal((await f.post('beverageDispatch',{...dispatch,tableAccount:await account(f),...changes})).status,200);return f.one('SELECT s.* FROM sales s JOIN beverage_dispatches d ON d.sale=s.id ORDER BY s.rowid DESC LIMIT 1');}
async function purchase(f,changes={}){assert.equal((await f.post('purchaseDocument',{...doc,...changes})).status,200);const e=await f.one('SELECT e.* FROM expenses e JOIN purchase_documents d ON d.expense=e.id ORDER BY e.rowid DESC LIMIT 1');const ls=(await f.raw.prepare('SELECT * FROM purchase_lines WHERE expense=?').bind(e.id).all()).results;return {e,ls};}
async function data(f){return (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();}
async function stock(f,p='agua'){return (await f.one('SELECT SUM(qty) n FROM stock_movements WHERE product=?',p)).n;}
function gate(f){let n=0,release;const wait=new Promise(r=>release=r);f.setGate(async ss=>{if(!ss.some(s=>s.sql.startsWith('INSERT INTO operation_requests')))return;if(++n===2)release();await wait;});}
test('table dispatch reduces stock exactly once; later collection and table reuse keep independent accounts',async t=>{
 const f=await fixture(t),a=await account(f),key=crypto.randomUUID(),d={...dispatch,tableAccount:a};
 assert.equal((await f.post('beverageDispatch',d,key)).status,200);assert.equal((await f.post('beverageDispatch',d,key)).status,200);
 assert.equal(await stock(f),40);assert.equal(await f.count('beverage_dispatches'),1);
 const before=await f.count('cash_movements'),settle={date,tableAccount:a,method:'Cobro',account:'Banco',...who};
 assert.equal((await f.post('beverageSettle',settle)).status,200);assert.equal((await f.post('beverageSettle',settle)).status,400);
 assert.equal(await stock(f),40);assert.equal(await f.count('cash_movements'),before+1);assert.equal((await f.one("SELECT amount FROM cash_movements WHERE kind='Venta'")).amount,2468);
 const next=await account(f);assert.notEqual(next,a);assert.equal((await f.post('beverageDispatch',{...d,tableAccount:next,qty:1})).status,200);assert.equal((await f.post('beverageDispatch',d)).status,400);
 const view=f.load('lib/hotel-supply-view.ts'),all=await data(f);assert.equal(view.tableTotal(all,next),1234);assert.equal(view.dispatchStatus(all,all.beverage_dispatches[0].sale),'Cobrado');
});
test('table can deliver physically and charge a stay directly or transfer later without another stock movement',async t=>{
 const f=await fixture(t),b=await f.one("SELECT * FROM bookings WHERE id='demo-1'"),initial=await f.count('cash_movements');
 const s=await send(f,{mode:'Estadía',booking:b.id});assert.equal(s.booking,b.id);assert.equal(s.account,null);
 const pending=await send(f),d=await f.one('SELECT * FROM beverage_dispatches WHERE sale=?',pending.id);
 assert.equal((await f.post('beverageSettle',{date,tableAccount:d.table_account,method:'Estadía',booking:b.id,account:'Efectivo',...who})).status,200);
 assert.equal(await stock(f),38);assert.equal(await f.count('cash_movements'),initial);assert.equal(await f.count('beverage_transfers'),1);
 const all=await data(f),bal=f.load('lib/hotel-view.ts').bookingBalance(b,all.sales,all.cash_movements);assert.equal(bal,b.amount-10000000+4936);
 assert.equal((await f.post('beverageCorrect',{dispatch:pending.id,date,reason:'Error',...who})).status,400);
});
test('courtesy and internal dispatch require reasons and never generate monetary collections',async t=>{
 const f=await fixture(t),n=await f.count('cash_movements');
 for(const destination of ['Cortesía','Interno']){assert.equal((await f.post('beverageDispatch',{...dispatch,destination,mode:'Sin cobro',reason:'',tableAccount:''})).status,400);await send(f,{destination,mode:'Sin cobro',reason:'Acuerdo de prueba',tableAccount:''});}
 assert.equal(await stock(f),38);assert.equal(await f.count('cash_movements'),n);assert.equal((await f.one('SELECT SUM(amount) n FROM sales')).n,0);
});
test('physical returns are partial, bounded, idempotent and independent of payments and corrections',async t=>{
 const f=await fixture(t),s=await send(f,{mode:'Inmediato'}),cash=await f.count('cash_movements'),key=crypto.randomUUID(),r={dispatch:s.id,date,qty:1,reason:'Regresó sellada',...who};
 assert.equal((await f.post('beverageReturn',r,key)).status,200);assert.equal((await f.post('beverageReturn',r,key)).status,200);assert.equal(await stock(f),41);
 assert.equal((await f.post('beverageReturn',{...r,qty:2})).status,400);assert.equal((await f.post('beverageReturn',r)).status,200);assert.equal(await stock(f),42);assert.equal(await f.count('cash_movements'),cash);
 assert.equal((await f.post('beverageCorrect',{dispatch:s.id,date,reason:'Error',...who})).status,400);
});
test('correction preserves original, compensates charge, never silently returns stock and blocks paid stays',async t=>{
 const f=await fixture(t),s=await send(f),n=await f.count('cash_movements');
 assert.equal((await f.post('beverageCorrect',{dispatch:s.id,date,reason:'Despacho erróneo',...who})).status,200);assert.deepEqual(await f.one('SELECT * FROM sales WHERE id=?',s.id),s);assert.equal(await stock(f),40);assert.equal(await f.count('cash_movements'),n);assert.equal((await f.one('SELECT SUM(amount) n FROM sales')).n,0);
 assert.equal((await f.post('beverageCorrect',{dispatch:s.id,date,reason:'Otra vez',...who})).status,400);
 const a=await f.one('SELECT table_account FROM beverage_dispatches WHERE sale=?',s.id);assert.equal((await f.post('beverageSettle',{date,tableAccount:a.table_account,method:'Cobro',account:'Banco',...who})).status,200);assert.equal(await f.count('cash_movements'),n);
 const booked=await send(f,{destination:'Estadía',tableAccount:'',mode:'Estadía',booking:'demo-2'});
 assert.equal((await f.post('beverageCorrect',{dispatch:booked.id,date,reason:'Error',...who})).status,200);
 const paid=await send(f,{destination:'Estadía',tableAccount:'',mode:'Estadía',booking:'demo-1'});assert.equal((await f.post('beverageCorrect',{dispatch:paid.id,date,reason:'Error',...who})).status,400);
});
test('multi-product invoice creates one debt, exact cent rounding and no stock until actual partial receipts',async t=>{
 const f=await fixture(t),n=await f.count('expenses'),{e,ls}=await purchase(f);assert.equal(await f.count('expenses'),n+1);assert.equal(e.amount,2502);assert.equal(e.due,'');assert.equal(await stock(f),42);
 const water=ls.find(l=>l.product==='agua'),meat=ls.find(l=>l.product==='carne');
 const first={expense:e.id,date,lines:[{line:water.id,qty:1},{line:meat.id,qty:0.5}],...who},key=crypto.randomUUID();assert.equal((await f.post('purchaseReceive',first,key)).status,200);assert.equal((await f.post('purchaseReceive',first,key)).status,200);assert.equal(await stock(f),43);assert.equal(await stock(f,'carne'),18.5);
 assert.equal((await f.post('purchaseReceive',{...first,lines:[{line:water.id,qty:3},{line:meat.id,qty:1}]})).status,200);assert.equal(await stock(f),46);assert.equal(await stock(f,'carne'),19.5);
 const before=await f.count('stock_movements');assert.equal((await f.post('purchaseReceive',first)).status,400);assert.equal(await f.count('stock_movements'),before);assert.equal(f.load('lib/hotel-supply-view.ts').receiptPending(await data(f),water),0);
});
test('supplier partial payments affect funds once, preserve references, derive debt and do not receive stock',async t=>{
 const f=await fixture(t),{e}=await purchase(f),key=crypto.randomUUID(),p={expense:e.id,date,amount:10,account:'Billetera',reference:'TEST-PAGO',...who};
 assert.equal((await f.post('supplierPay',p,key)).status,200);assert.equal((await f.post('supplierPay',p,key)).status,200);assert.equal(await stock(f),42);
 const view=f.load('lib/hotel-supply-view.ts');assert.deepEqual(view.supplierBalance(await data(f),e),{paid:1000,balance:1502,status:'Parcialmente pagado'});assert.equal((await f.one('SELECT reference FROM supplier_payment_details')).reference,p.reference);
 assert.equal((await f.post('supplierPay',{...p,amount:15.03})).status,400);assert.equal((await f.post('supplierPay',{...p,amount:15.02})).status,200);assert.equal(view.supplierBalance(await data(f),e).status,'Pagado');assert.equal(await stock(f),42);
 assert.equal(view.supplierBalance(await data(f),e,'2026-10-02').paid,0);
});
test('fully-received shortcut, services and historic purchases retain their different meanings',async t=>{
 const f=await fixture(t);await purchase(f,{received:true});assert.equal(await stock(f),46);
 const {e}=await purchase(f,{type:'Servicio',category:'Internet',amount:100,lines:[],due:'2026-10-10'});assert.equal(await stock(f),46);assert.equal((await f.post('supplierPay',{expense:e.id,date,amount:100,account:'Banco',...who})).status,200);assert.equal(await stock(f),46);
 assert.equal((await f.post('purchase',{date,due:date,supplier:'Histórico',product:'agua',qty:2,cost:1,paid:false,account:'Banco'})).status,200);assert.equal(await stock(f),48);const legacy=await f.one("SELECT * FROM expenses WHERE supplier='Histórico'");assert.equal(await f.one('SELECT * FROM purchase_documents WHERE expense=?',legacy.id),null);
 const view=f.load('lib/hotel-supply-view.ts');assert.equal(view.dueLabel({...e,due:''},100,date),'Vencimiento sin definir');assert.equal(view.dueLabel(e,100,date),'Próximo a vencer (7 días)');assert.equal(view.dueLabel({...e,due:'2026-09-30'},100,date),'Vencido');assert.equal(view.dueLabel(e,0,date),'Pagado');const csv=view.supplierCsv(await data(f),[e,legacy],date);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('Histórica · sin reinterpretar'));assert.ok(csv.includes('100,00')||csv.includes('"100"'));
});
test('concurrent receipts, payments, returns and dispatches cannot bypass database limits',async t=>{
 const f=await fixture(t),{e,ls}=await purchase(f),water=ls.find(l=>l.product==='agua');
 for(const [action,d,count] of [['purchaseReceive',{expense:e.id,date,lines:[{line:water.id,qty:4}],...who},'purchase_receipts'],['supplierPay',{expense:e.id,date,amount:25.02,account:'Banco',...who},'supplier_payment_details']]){gate(f);const rs=await Promise.all([f.post(action,d),f.post(action,d)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,400]);f.setGate(null);assert.equal(await f.count(count),1);}
 const s=await send(f);gate(f);const r={dispatch:s.id,date,qty:2,reason:'Retorno',...who};assert.deepEqual((await Promise.all([f.post('beverageReturn',r),f.post('beverageReturn',r)])).map(r=>r.status).sort(),[200,400]);f.setGate(null);
 const a=await account(f);gate(f);const d={...dispatch,tableAccount:a,qty:30};assert.deepEqual((await Promise.all([f.post('beverageDispatch',d),f.post('beverageDispatch',d)])).map(r=>r.status).sort(),[200,400]);f.setGate(null);assert.ok(await stock(f)>=0);
});
test('a dispatch added after account lookup rolls back an incomplete settlement; retry includes all lines',async t=>{
 const f=await fixture(t),s=await send(f),d=await f.one('SELECT * FROM beverage_dispatches WHERE sale=?',s.id);let ready,resume;const arrived=new Promise(r=>ready=r),wait=new Promise(r=>resume=r);
 f.setGate(async ss=>{if(ss.some(s=>s.sql.startsWith('INSERT INTO beverage_settlements'))){ready();await wait;}});
 const settle={date,tableAccount:d.table_account,method:'Cobro',account:'Banco',...who},pending=f.post('beverageSettle',settle);await arrived;
 assert.equal((await f.post('beverageDispatch',{...dispatch,tableAccount:d.table_account,qty:1})).status,200);resume();assert.equal((await pending).status,400);f.setGate(null);assert.equal(await f.count('beverage_settlements'),0);assert.equal((await f.post('beverageSettle',settle)).status,200);assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE kind='Venta'")).n,3702);
});
test('closed dates block corrections and financial mutations but later physical returns remain separate',async t=>{
 const f=await fixture(t),s=await send(f),{e,ls}=await purchase(f);const expected=(await f.one("SELECT SUM(amount) n FROM cash_movements WHERE account='Efectivo' AND date<=?",date)).n;
 assert.equal((await f.post('close',{date,counted:expected/100,note:''})).status,200);
 assert.equal((await f.post('beverageCorrect',{dispatch:s.id,date:'2026-10-04',reason:'Error',...who})).status,400);
 assert.equal((await f.post('purchaseReceive',{expense:e.id,date,lines:[{line:ls[0].id,qty:1}],...who})).status,400);assert.equal((await f.post('supplierPay',{expense:e.id,date,amount:1,account:'Banco',...who})).status,400);
 assert.equal((await f.post('beverageReturn',{dispatch:s.id,date:'2026-10-04',qty:1,reason:'Regresó físicamente',...who})).status,200);assert.equal(await stock(f),41);
});
