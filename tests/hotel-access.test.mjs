import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture,testPassword } from './helpers/hotel-fixture.mjs';
async function account(f,roles,id=roles.join('-')){
 const hash=await f.load('modules/access/passwords.ts').hashPassword(testPassword);
 await f.raw.prepare('INSERT INTO users (id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').bind(id,'Operator '+id,id+'@example.test',JSON.stringify(roles),hash).run();
 const response=await f.auth.login(f.authRequest('/api/auth/login',{email:id+'@example.test',password:testPassword}));assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 return {id,cookie,get:async(path='/api/hotel')=>f.load(path==='/api/hotel/personnel'?'app/api/hotel/personnel/route.ts':path==='/api/hotel/users'?'app/api/hotel/users/route.ts':'app/api/hotel/route.ts').GET(new Request('http://localhost'+path,{headers:{Cookie:cookie}})),post:async(action,data,key=crypto.randomUUID())=>f.api.POST(f.authRequest('/api/hotel',{action,data},{Cookie:cookie,'Idempotency-Key':key}))};
}
test('initial roles have exact additive permissions, deny direct foreign operations and reserve account management',async t=>{
 const f=await fixture(t),catalog=f.load('modules/access/permissions.ts');
 for(const role of ['administration','manager','reception','restaurant','supply','kitchen','partner']){
  const user=await account(f,[role]);const response=await user.get();assert.equal(response.status,200);const data=await response.json();
  assert.deepEqual(data.identity.permissions.slice().sort(),catalog.initialPermissions[role].slice().sort());
  assert.equal((await user.post('userSave',{name:'No permission',email:'reject@example.test',active:true,roles:['superadmin'],password:testPassword})).status,403);
  assert.equal((await user.get('/api/hotel/users')).status,403);
  if(role==='partner')for(const [action,input] of [['room',{room:2,state:'Limpia'}],['stock',{date:'2026-10-03',product:'agua',qty:1,reason:'Merma'}],['mealPlan',{customer:'External',date:'2026-10-03',service:'Cena',qty:1}]])assert.equal((await user.post(action,input)).status,403);
 }
 const multi=await account(f,['reception','supply']);const data=await(await multi.get()).json();assert.deepEqual(data.identity.permissions.slice().sort(),[...new Set([...catalog.initialPermissions.reception,...catalog.initialPermissions.supply])].sort());
 assert.equal((await multi.post('room',{room:2,state:'Pendiente de limpieza'})).status,200);
 assert.equal((await multi.post('stock',{date:'2026-10-03',product:'agua',qty:1,reason:'Merma'})).status,200);
 assert.equal((await multi.post('supplierPay',{expense:'expense-1',date:'2026-10-03',amount:1,account:'Banco'})).status,403);
});
test('kitchen receives food and restrictions without financial fields or private staff reports',async t=>{
 const f=await fixture(t),kitchen=await account(f,['kitchen']);
 const data=await(await kitchen.get()).json();
 for(const table of ['cash_movements','expenses','daily_closes','booking_terms','room_rates','purchase_lines','staff_reports'])assert.ok(!data[table]||data[table].length===0,table);
 for(const row of [...data.bookings,...data.products,...data.sales])for(const field of ['amount','price','cost','account','phone','source','note'])assert.equal(row[field],undefined,field);
 assert.equal((await kitchen.get('/api/hotel/personnel')).status,403);
 assert.equal((await kitchen.post('mealPlan',{customer:'Explicit group',date:'2026-10-03',service:'Cena',qty:2})).status,200);
 assert.equal((await kitchen.post('menuPlan',{date:'2026-10-03',service:'Cena',dishes:'Explicit menu',status:'Borrador'})).status,200);
 assert.equal((await kitchen.post('payment',{booking:'demo-1',date:'2026-10-03',amount:1,account:'Banco'})).status,403);
});
test('reception sees stay balances and payments without bank openings or supplier payments; collections require a grant',async t=>{
 const f=await fixture(t),reception=await account(f,['reception']);
 const data=await(await reception.get()).json();assert.ok(data.bookings.some(b=>b.amount>0));assert.ok(data.cash_movements.length>0);
 assert.ok(data.cash_movements.every(m=>m.kind==='Cobro'&&data.bookings.some(b=>b.id===m.ref)));assert.ok(!data.cash_movements.some(m=>m.id==='opening-bank'));
 assert.equal((await reception.post('payment',{booking:'demo-1',date:'2026-10-03',amount:1,account:'Banco'})).status,403);
 const before=await f.one("SELECT * FROM roles WHERE id='reception'");
 assert.equal((await f.post('rolePermissions',{id:'reception',version:before.version,permissions:[...JSON.parse(before.permissions),'reservations.collect']})).status,200);
 assert.equal((await reception.post('payment',{booking:'demo-1',date:'2026-10-03',amount:1,account:'Banco'})).status,200);
 const after=await f.one("SELECT * FROM roles WHERE id='reception'");assert.equal((await f.post('rolePermissions',{id:'reception',version:after.version,permissions:JSON.parse(before.permissions)})).status,200);
 assert.equal((await reception.post('payment',{booking:'demo-1',date:'2026-10-03',amount:1,account:'Banco'})).status,403);
});
test('editing a reservation cannot change or remove special terms through preserved prices',async t=>{
 const f=await fixture(t),reception=await account(f,['reception']);
 const input={guest:'Special agreement',phone:'',room:2,start:'2026-11-01',end:'2026-11-03',pax:1,regime:'Desayuno',meal:'Cena',source:'Directa',note:'',priceMode:'Acordado',amount:500,discountType:'Porcentaje',discountValue:10,benefit:'Descuento',paymentCondition:'Pago al egreso',reason:'Explicit agreement',observation:'',barterAgreement:''};
 const created=await f.post('booking',input);assert.equal(created.status,200,JSON.stringify(created));
 const booking=await f.one("SELECT * FROM bookings WHERE guest='Special agreement'");
 const edit={...input,id:booking.id,version:0,priceMode:'Conservar',note:'Reception note'};
 assert.equal((await reception.post('bookingEdit',edit)).status,200);
 for(const change of [{benefit:'Amigo'},{reason:'Replaced agreement'},{barterAgreement:'Unexpected barter'},{priceMode:'Tarifa',benefit:'Habitual',discountType:'Ninguno',discountValue:0}])assert.equal((await reception.post('bookingEdit',{...edit,version:1,...change})).status,403);
 const terms=await f.one('SELECT * FROM booking_terms WHERE booking=?',booking.id);assert.equal(terms.version,1);assert.equal(terms.benefit,'Descuento');assert.equal(terms.discount_amount,5000);
 assert.equal((await f.one('SELECT * FROM bookings WHERE id=?',booking.id)).amount,45000);
});

test('stock receives a real purchase without prices, balances or permission to pay it',async t=>{
 const f=await fixture(t);assert.equal((await f.post('purchaseDocument',{date:'2026-10-03',supplier:'Test provider',label:'Stock test',area:'Restaurante',kind:'Variable',type:'Productos',category:'Productos',lines:[{product:'agua',category:'Bebidas',qty:3,cost:2}]})).status,200);
 const stock=await account(f,['supply']),data=await(await stock.get()).json(),line=data.purchase_lines[0];assert.ok(line);
 assert.equal(line.cost,undefined);assert.equal(line.amount,undefined);assert.equal(data.cash_movements.length,0);assert.ok(data.expenses.every(e=>e.amount===undefined));
 const previous=await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'");
 assert.equal((await stock.post('purchaseReceive',{expense:line.expense,date:'2026-10-03',lines:[{line:line.id,qty:2}]})).status,200);
 assert.equal((await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n,previous.n+2);
 assert.equal((await stock.post('supplierPay',{expense:line.expense,date:'2026-10-03',amount:1,account:'Banco'})).status,403);
});
test('identity comes from the session, history remains attributed and secrets never enter audits or user listings',async t=>{
 const f=await fixture(t),operator=await account(f,['manager']);
 assert.equal((await operator.post('supplierProfile',{name:'Provider',contact:'',rubros:['Otros'],frequency:'Sin frecuencia',schedule:{},responsible:'Spoofed name',actor:'Spoofed',user_id:'someone-else'})).status,200);
 const audit=await f.one("SELECT * FROM audit_log WHERE action='supplierProfile'");assert.equal(audit.actor_id,operator.id);assert.equal(audit.actor,'Operator manager');assert.equal(JSON.parse(audit.detail).input.responsible,audit.actor);
 assert.equal((await f.post('userSave',{name:'New User',email:'new@example.test',active:true,roles:['reception'],password:testPassword})).status,200);
 const log=await f.one("SELECT * FROM audit_log WHERE action='userSave'");assert.ok(!log.detail.includes(testPassword));assert.ok(!log.detail.includes('password_hash'));
 const adminListing=await f.load('app/api/hotel/users/route.ts').GET(new Request('http://localhost/api/hotel/users',{headers:{Cookie:f.cookie}}));assert.equal(adminListing.status,200);assert.ok(!(await adminListing.text()).includes('pbkdf2'));
});
test('deactivation, access reset and permission revocation invalidate existing access and reject in-flight batches atomically',async t=>{
 const f=await fixture(t),user=await account(f,['reception']);let profile=await f.one('SELECT * FROM users WHERE id=?',user.id);
 assert.equal((await f.post('userSave',{...profile,active:false,roles:JSON.parse(profile.roles)})).status,200);assert.equal((await user.get()).status,401);
 profile=await f.one('SELECT * FROM users WHERE id=?',user.id);assert.equal((await f.post('userSave',{...profile,active:true,roles:JSON.parse(profile.roles)})).status,200);assert.equal((await user.get()).status,401);
 const manager=await account(f,['manager']),before=await f.one('SELECT * FROM rooms WHERE id=2');let gated=false;
 f.setGate(async statements=>{if(!gated&&statements.some(s=>s.sql.startsWith('UPDATE rooms'))){gated=true;await f.raw.prepare('UPDATE roles SET permissions=?,version=version+1 WHERE id=?').bind('[]','manager').run();}});
 assert.equal((await manager.post('room',{room:2,state:'Fuera de servicio'})).status,403);assert.deepEqual(await f.one('SELECT * FROM rooms WHERE id=2'),before);
 f.setGate(null);const p=await f.one('SELECT * FROM users WHERE id=?',manager.id);assert.equal((await f.post('userReset',{id:p.id,version:p.version,password:'new-private-password'})).status,200);assert.equal((await manager.get()).status,401);
 assert.ok((await f.one("SELECT * FROM audit_log WHERE action='userReset'")).detail.includes('accessReset'));assert.ok(!(await f.one("SELECT * FROM audit_log WHERE action='userReset'")).detail.includes('new-private-password'));
});
test('the last active superadministrator cannot be disabled or demoted, including simultaneous changes',async t=>{
 const f=await fixture(t),superProfile=await f.one("SELECT * FROM users WHERE id='test-admin'");
 for(const change of [{active:false,roles:['superadmin']},{active:true,roles:['manager']}])assert.equal((await f.post('userSave',{...superProfile,...change})).status,400);
 assert.equal((await f.post('rolePermissions',{id:'superadmin',version:0,permissions:[]})).status,400);
 assert.equal((await f.post('rolePermissions',{id:'manager',version:0,permissions:['users.configure']})).status,400);
 const second=await account(f,['superadmin'],'second-admin');const other=await f.one('SELECT * FROM users WHERE id=?',second.id);
 const results=await Promise.all([f.post('userSave',{...superProfile,active:false,roles:['superadmin']}),second.post('userSave',{...other,active:false,roles:['superadmin']})]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal((await f.one("SELECT COUNT(*) n FROM users WHERE active=1 AND EXISTS(SELECT 1 FROM json_each(roles) WHERE value='superadmin')")).n,1);
});
test('personnel reports require a separate permission and export checks cannot be bypassed by query parameters',async t=>{
 const f=await fixture(t);assert.equal((await f.post('rolePermissions',{id:'partner',version:0,permissions:['panel.view','personnel.view']})).status,200);
 const partner=await account(f,['partner']);const personnel=await(await partner.get('/api/hotel/personnel')).json();assert.deepEqual(personnel.staff_reports,[]);assert.ok(personnel.audit_log.every(a=>a.action!=='staffReport'));
 assert.equal((await partner.post('staffEmployee',{name:'Employee',role:'Kitchen',active:true})).status,403);
 assert.equal((await f.api.GET(new Request('http://localhost/api/hotel?export=personnel',{headers:{Cookie:partner.cookie}}))).status,403);
});
test('restaurant can dispatch at the catalog price without collection or room-charge privileges',async t=>{
 const f=await fixture(t),restaurant=await account(f,['restaurant']);
 assert.equal((await restaurant.post('beverageAccount',{table:'Permission table',date:'2026-10-03',time:'12:00'})).status,200);
 const table=await f.one('SELECT * FROM beverage_accounts');
 const input={date:'2026-10-03',time:'13:00',product:'agua',qty:1,price:2500,destination:'Mesa',tableAccount:table.id,mode:'Pendiente',customer:'Table guest',account:'Efectivo'};
 assert.equal((await restaurant.post('beverageDispatch',input)).status,200);
 assert.equal((await restaurant.post('beverageDispatch',{...input,price:1})).status,403);
 assert.equal((await restaurant.post('beverageDispatch',{...input,mode:'Inmediato'})).status,403);
 assert.equal((await restaurant.post('beverageDispatch',{...input,mode:'Estadía',booking:'demo-1'})).status,403);
 assert.equal((await restaurant.post('beverageSettle',{tableAccount:table.id,date:input.date,method:'Cobro',account:'Efectivo'})).status,403);
 const data=await(await restaurant.get()).json();assert.equal(data.cash_movements.length,0);assert.equal(data.booking_terms.length,0);
 const kitchen=await account(f,['kitchen']);assert.equal((await kitchen.post('mealServe',{booking:'demo-1',guests:['demo-1:person:1'],date:input.date,service:'Cena'})).status,200);
});
test('permission changes during a protected read reject the response without leaking previously authorized data',async t=>{
 const f=await fixture(t),accountUser=await account(f,['administration']);let gated=false;
 f.setGate(async statements=>{if(!gated&&statements.some(s=>s.sql==='SELECT * FROM cash_movements')){gated=true;await f.raw.prepare('UPDATE roles SET permissions=?,version=version+1 WHERE id=?').bind('[]','administration').run();}});
 const response=await accountUser.get();assert.equal(response.status,403);assert.equal((await response.json()).cash_movements,undefined);
});
