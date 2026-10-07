import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/hotel-fixture.mjs';
const who={responsible:'Gerencia de prueba'};
const profile={name:'Proveedor de prueba',contact:'Contacto de prueba',rubros:['Bebidas'],frequency:'Semanal',schedule:{start:'2026-10-01',end:'',weekdays:[1],interval:null,dates:[]},leadDays:2,...who};
const menu={date:'2026-10-01',service:'Cena',dishes:'Menú expresamente cargado',alternatives:'Alternativa declarada',conditions:'Consultar procedimiento al responsable',observation:'No deducir aptitud',status:'Borrador',...who};
const shift={kind:'Turno',startDate:'2026-10-03',endDate:'2026-10-03',startTime:'08:00',endTime:'16:00',...who};
async function supplier(f,changes={}){assert.equal((await f.post('supplierProfile',{...profile,...changes})).status,200);return f.one('SELECT * FROM suppliers ORDER BY rowid DESC LIMIT 1');}
async function employee(f,changes={}){assert.equal((await f.post('staffEmployee',{name:'Empleado de prueba',role:'Recepción',contact:'Contacto',active:true,...who,...changes})).status,200);return f.one('SELECT * FROM employees ORDER BY rowid DESC LIMIT 1');}
async function event(f,e,changes={}){assert.equal((await f.post('staffEvent',{...shift,employee:e.id,...changes})).status,200);return f.one('SELECT * FROM staff_events ORDER BY rowid DESC LIMIT 1');}
async function baseline(f){return {cash:await f.count('cash_movements'),stock:await f.count('stock_movements'),sales:await f.count('sales'),expenses:await f.count('expenses')};}
async function all(f){return (await f.api.GET(new Request('http://localhost/api/hotel',{headers:{Cookie:f.cookie}}))).json();}
function gate(f){let arrivals=0,release;const wait=new Promise(r=>release=r);f.setGate(async ss=>{if(!ss.some(s=>s.sql.startsWith('INSERT INTO operation_requests')))return;if(++arrivals===2)release();await wait;});}
function pause(f,sql){let ready,resume;const arrived=new Promise(r=>ready=r),wait=new Promise(r=>resume=r);f.setGate(async ss=>{if(ss.some(s=>s.sql.startsWith(sql))){ready();await wait;}});return {arrived,resume};}
async function expected(f,from,to,days){const result=[],source=(await f.raw.prepare('SELECT * FROM menu_plans WHERE date>=? AND date<=?').bind(from,f.load('lib/hotel-planning.ts').shiftDate(from,days-1)).all()).results;for(const s of source){const offset=Math.round((Date.parse(s.date)-Date.parse(from))/86400000),id=f.load('lib/hotel-planning.ts').shiftDate(to,offset)+':'+s.service,old=await f.one('SELECT version FROM menu_plans WHERE id=?',id);result.push({id,version:old?.version??-1});}return result;}
test('weekly agenda regenerates without duplicates and reprograms only one occurrence',async t=>{
 const f=await fixture(t),s=await supplier(f),before=await baseline(f),d={supplier:s.id,version:s.version,from:'2026-10-01',to:'2026-10-21',...who};
 assert.equal((await f.post('deliveryGenerate',d)).status,200);assert.equal(await f.count('supplier_deliveries'),3);const first=await f.one("SELECT * FROM supplier_deliveries WHERE date='2026-10-05'");assert.equal(first.deadline,'2026-10-03');assert.equal(first.status,'Prevista');
 assert.equal((await f.post('deliveryEdit',{...first,date:'2026-10-06',deadline:'2026-10-04',expense:'',status:'Reprogramada',observation:'Cambio de visita',...who})).status,200);
 assert.equal((await f.post('deliveryGenerate',d)).status,200);assert.equal(await f.count('supplier_deliveries'),3);assert.equal((await f.one('SELECT date FROM supplier_deliveries WHERE id=?',first.id)).date,'2026-10-06');assert.equal((await f.one("SELECT COUNT(*) n FROM supplier_deliveries WHERE date IN ('2026-10-12','2026-10-19')")).n,2);assert.deepEqual(await baseline(f),before);
 const history=await f.one("SELECT detail FROM audit_log WHERE action='deliveryEdit'");assert.equal(JSON.parse(history.detail).before.date,'2026-10-05');
});
test('intervals use explicit anchor, punctual dates are explicit and unknown deliveries remain unconfirmed',async t=>{
 const f=await fixture(t),s=await supplier(f,{frequency:'Cada N días',leadDays:null,schedule:{start:'2026-10-02',end:'',interval:3,dates:[],weekdays:[]}});
 await f.post('deliveryGenerate',{supplier:s.id,version:0,from:'2026-10-01',to:'2026-10-09',...who});assert.equal(await f.count('supplier_deliveries'),3);assert.equal((await f.one("SELECT date,deadline FROM supplier_deliveries ORDER BY date LIMIT 1")).date,'2026-10-02');assert.equal((await f.one('SELECT deadline FROM supplier_deliveries LIMIT 1')).deadline,null);
 const punctual=await supplier(f,{name:'Puntual',frequency:'Fechas puntuales',schedule:{dates:['2026-10-04','2026-10-04','2026-10-11']}});await f.post('deliveryGenerate',{supplier:punctual.id,version:0,from:'2026-10-01',to:'2026-10-12',...who});assert.equal((await f.one('SELECT COUNT(*) n FROM supplier_deliveries WHERE supplier=?',punctual.id)).n,2);
 assert.equal((await f.post('deliveryEdit',{supplier:s.id,date:'',deadline:'',status:'Prevista',...who})).status,200);let unknown=await f.one('SELECT * FROM supplier_deliveries WHERE date IS NULL');assert.equal((await f.post('deliveryEdit',{...unknown,date:'',deadline:'',expense:'',observation:'A confirmar',...who})).status,200);unknown=await f.one('SELECT * FROM supplier_deliveries WHERE id=?',unknown.id);
 assert.equal((await f.post('deliveryEdit',{...unknown,date:'',deadline:'',expense:'',status:'Confirmada',...who})).status,400);
 assert.equal((await f.post('deliveryEdit',{...unknown,date:'2026-10-14',deadline:'',expense:'',status:'Confirmada',...who})).status,200);
 assert.equal((await f.post('supplierProfile',{...profile,frequency:'Cada N días',schedule:{start:'',interval:3}})).status,400);
});
test('realized linked delivery never receives or pays; purchase receipt remains the only stock entry',async t=>{
 const f=await fixture(t),s=await supplier(f);await f.post('purchaseDocument',{date:'2026-10-03',due:'',supplier:s.name,label:'Bebidas pendientes',type:'Productos',category:'Productos',area:'Restaurante',kind:'Variable',lines:[{product:'agua',category:'Bebidas',qty:4,cost:10}],...who});const e=await f.one('SELECT * FROM expenses ORDER BY rowid DESC LIMIT 1'),before=await baseline(f);
 assert.equal((await f.post('deliveryEdit',{supplier:s.id,date:'2026-10-04',status:'Realizada',expense:e.id,...who})).status,200);assert.deepEqual(await baseline(f),before);const line=await f.one('SELECT * FROM purchase_lines WHERE expense=?',e.id),request=crypto.randomUUID(),receive={date:'2026-10-04',expense:e.id,lines:[{line:line.id,qty:4}],...who};assert.equal((await f.post('purchaseReceive',receive,request)).status,200);assert.equal((await f.post('purchaseReceive',receive,request)).status,200);assert.equal(await f.count('stock_movements'),before.stock+1);assert.equal(await f.count('cash_movements'),before.cash);
});
test('agenda generation validates current frequency under a concurrent profile edit',async t=>{
 const f=await fixture(t),s=await supplier(f),p=pause(f,'INSERT INTO supplier_deliveries');const pending=f.post('deliveryGenerate',{supplier:s.id,version:0,from:'2026-10-01',to:'2026-10-21',...who});await p.arrived;
 assert.equal((await f.post('supplierProfile',{...profile,id:s.id,version:0,schedule:{...profile.schedule,weekdays:[2]}})).status,200);p.resume();assert.equal((await pending).status,409);assert.equal(await f.count('supplier_deliveries'),0);
});
test('menus edit one day, copy a week atomically, reject duplicates and require explicit replacement with current versions',async t=>{
 const f=await fixture(t),before=await baseline(f);for(let i=0;i<7;i++)assert.equal((await f.post('menuPlan',{...menu,date:f.load('lib/hotel-planning.ts').shiftDate(menu.date,i)})).status,200);
 let first=await f.one('SELECT * FROM menu_plans WHERE id=?',menu.date+':Cena');assert.equal((await f.post('menuPlan',{...first,dishes:'Cambio de un día',...who})).status,200);assert.equal((await f.one("SELECT dishes FROM menu_plans WHERE date='2026-10-02'")).dishes,menu.dishes);
 const copy={from:'2026-10-01',to:'2026-10-15',days:7,expected:await expected(f,'2026-10-01','2026-10-15',7),...who};assert.equal((await f.post('menuCopy',copy)).status,200);assert.equal(await f.count('menu_plans'),14);assert.equal((await f.post('menuCopy',copy)).status,400);assert.equal(await f.count('menu_plans'),14);
 assert.equal((await f.post('menuCopy',{...copy,overwrite:true})).status,409);assert.equal((await f.post('menuCopy',{...copy,overwrite:true,expected:await expected(f,copy.from,copy.to,7)})).status,200);assert.equal(await f.count('menu_plans'),14);assert.deepEqual(await baseline(f),before);
});
test('actual menu preserves original plan snapshot and does not mark attendance or infer allergy suitability',async t=>{
 const f=await fixture(t),before=await baseline(f);await f.post('menuPlan',menu);let p=await f.one('SELECT * FROM menu_plans');assert.equal((await f.post('menuActual',{plan:p.id,dishes:'Platos realmente servidos',alternatives:'Alternativa registrada',conditions:'Declaración manual',observation:'Cambio por disponibilidad',...who})).status,200);
 const actual=await f.one('SELECT * FROM menu_actuals');assert.equal(JSON.parse(actual.planned_snapshot).dishes,menu.dishes);assert.equal((await f.post('menuPlan',{...p,dishes:'Plan editado después',...who})).status,200);assert.deepEqual(await f.one('SELECT * FROM menu_actuals'),actual);assert.equal(await f.count('meal_services'),0);assert.deepEqual(await baseline(f),before);
});
test('menu copy rolls back all destinations when the source or any destination changes concurrently',async t=>{
 const f=await fixture(t);await f.post('menuPlan',menu);await f.post('menuPlan',{...menu,date:'2026-10-02'});const copy={from:'2026-10-01',to:'2026-10-15',days:7,expected:await expected(f,'2026-10-01','2026-10-15',7),...who},p=pause(f,'INSERT INTO menu_plans');const pending=f.post('menuCopy',copy);await p.arrived;const original=await f.one('SELECT * FROM menu_plans WHERE id=?',menu.date+':Cena');await f.post('menuPlan',{...original,dishes:'Cambió durante copia',...who});p.resume();assert.equal((await pending).status,409);assert.equal(await f.count('menu_plans'),2);f.setGate(null);
 gate(f);const fresh={...copy,expected:await expected(f,copy.from,copy.to,7)},rs=await Promise.all([f.post('menuCopy',fresh),f.post('menuCopy',fresh)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,400]);assert.equal(await f.count('menu_plans'),4);
});
test('staff planning warns for overlaps and absences, permits consecutive and nighttime shifts, separates actual attendance',async t=>{
 const f=await fixture(t),e=await employee(f),first=await event(f,e),before=await baseline(f);assert.equal(first.attendance,'Sin registrar');assert.equal(first.actual_start,null);
 assert.equal((await f.post('staffEvent',{...shift,employee:e.id,startTime:'15:00',endTime:'18:00'})).status,400);assert.equal((await f.post('staffEvent',{...shift,employee:e.id,startTime:'15:00',endTime:'18:00',acknowledge:true,observation:'Excepción autorizada'})).status,200);
 await event(f,e,{startTime:'18:00',endTime:'23:00'});const night=await event(f,e,{startDate:'2026-10-04',endDate:'2026-10-05',startTime:'22:00',endTime:'06:00'});assert.equal(night.end,'2026-10-05T06:00');
 await event(f,e,{kind:'Franco',startDate:'2026-10-06',endDate:'2026-10-06'});assert.equal((await f.post('staffEvent',{...shift,employee:e.id,startDate:'2026-10-06',endDate:'2026-10-06'})).status,400);
 assert.equal((await f.post('staffAttendance',{id:night.id,version:0,attendance:'Asistencia registrada',actualStart:'',actualEnd:'',observation:'Confirmación',...who})).status,400);
 assert.equal((await f.post('staffAttendance',{id:night.id,version:0,attendance:'Asistencia registrada',actualStart:'2026-10-04T22:15',actualEnd:'2026-10-05T06:10',observation:'Registro expreso',...who})).status,200);assert.equal((await f.one('SELECT start FROM staff_events WHERE id=?',night.id)).start,night.start);assert.deepEqual(await baseline(f),before);
});
test('concurrent overlapping assignments reject one transaction and stale edits preserve previous records',async t=>{
 const f=await fixture(t),e=await employee(f);gate(f);const results=await Promise.all([f.post('staffEvent',{...shift,employee:e.id}),f.post('staffEvent',{...shift,employee:e.id})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(await f.count('staff_events'),1);f.setGate(null);
 const old=await f.one('SELECT * FROM staff_events');await f.post('staffEvent',{...shift,id:old.id,version:0,employee:e.id,observation:'Primer cambio'});const current=await f.one('SELECT * FROM staff_events');assert.equal((await f.post('staffEvent',{...shift,id:old.id,version:0,employee:e.id,startTime:'09:00'})).status,409);assert.deepEqual(await f.one('SELECT * FROM staff_events'),current);
});
test('deactivation preserves shifts and reports; follow-up resolves without changing original author or exposing notes operationally',async t=>{
 const f=await fixture(t),e=await employee(f),ev=await event(f,e),api=f.load('app/api/hotel/personnel/route.ts');const report={employee:e.id,event:ev.id,date:'2026-10-03',type:'Incidencia',description:'NOTA INTERNA DE PRUEBA',status:'Pendiente',...who};assert.equal((await f.post('staffReport',report)).status,200);let r=await f.one('SELECT * FROM staff_reports');
 assert.equal((await api.GET(new Request('http://localhost/api/hotel/personnel'))).status,401);const main=await all(f);assert.equal('staff_reports' in main,false);assert.equal('employees' in main,false);assert.ok(!JSON.stringify(main).includes(report.description));
 assert.equal((await f.post('staffEmployee',{...e,active:false,...who})).status,200);assert.equal((await f.post('staffEvent',{...shift,employee:e.id,startDate:'2026-10-07',endDate:'2026-10-07'})).status,400);assert.deepEqual(await f.one('SELECT * FROM staff_events'),ev);assert.deepEqual(await f.one('SELECT * FROM staff_reports'),r);
 assert.equal((await f.post('staffReport',{...r,status:'Resuelto',followup:'Se resolvió expresamente',responsible:'Otro responsable'})).status,200);r=await f.one('SELECT * FROM staff_reports');assert.equal(r.author,who.responsible);assert.equal(r.status,'Resuelto');const privateData=await(await api.GET(new Request('http://localhost/api/hotel/personnel',{headers:{Cookie:f.cookie}}))).json();assert.equal(privateData.staff_reports.length,1);assert.ok(privateData.audit_log.some(a=>a.action==='staffReport'));
});
test('employee deactivation during assignment planning rejects the in-flight assignment',async t=>{
 const f=await fixture(t),e=await employee(f),p=pause(f,'INSERT INTO staff_events');const pending=f.post('staffEvent',{...shift,employee:e.id});await p.arrived;await f.post('staffEmployee',{...e,active:false,...who});p.resume();assert.equal((await pending).status,400);assert.equal(await f.count('staff_events'),0);
});
test('staff links and dates validate on the server and records cannot be deleted directly',async t=>{
 const f=await fixture(t),a=await employee(f),b=await employee(f,{name:'Otro empleado'}),ev=await event(f,a);assert.equal((await f.post('staffReport',{employee:b.id,event:ev.id,date:'2026-10-03',type:'Tarea',description:'Vínculo erróneo',status:'Pendiente',...who})).status,400);
 assert.equal((await f.post('staffEvent',{...shift,employee:a.id,startDate:'2026-02-30',endDate:'2026-03-01'})).status,400);assert.equal((await f.post('staffEvent',{...shift,employee:a.id,endTime:'07:00'})).status,400);
 await assert.rejects(f.raw.prepare('DELETE FROM staff_events WHERE id=?').bind(ev.id).run(),/HOT_HISTORY_IMMUTABLE/);
 const helper=f.load('lib/hotel-planning.ts');assert.equal(helper.shiftDate('2026-10-31',1),'2026-11-01');assert.equal(helper.monthDates('2028-02-10').length,29);assert.equal(helper.eventConflicts([ev],a.id,ev.end,'2026-10-03T17:00').length,0);
});
test('generation also respects manually recorded dates and an unknown delivery can have an explicit order deadline',async t=>{
 const f=await fixture(t),s=await supplier(f);assert.equal((await f.post('deliveryEdit',{supplier:s.id,date:'2026-10-05',status:'Confirmada',...who})).status,200);
 const g={supplier:s.id,version:0,from:'2026-10-01',to:'2026-10-21',...who};assert.equal((await f.post('deliveryGenerate',g)).status,200);assert.equal((await f.post('deliveryGenerate',g)).status,200);assert.equal(await f.count('supplier_deliveries'),3);
 assert.equal((await f.post('deliveryEdit',{supplier:s.id,date:'',deadline:'2026-10-07',status:'Prevista',...who})).status,200);assert.equal((await f.one('SELECT deadline FROM supplier_deliveries WHERE date IS NULL')).deadline,'2026-10-07');
});
