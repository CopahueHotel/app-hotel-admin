import { z } from 'zod';
import { validDate } from './hotel-reservations';
import { deliveryDates, eventPeriod, eventConflicts, shiftDate } from './hotel-planning';
import type { HotelTables, PersonnelTables } from './hotel-types';
const text=z.string().trim().min(1).max(240),long=z.string().trim().min(1).max(4000),note=z.string().max(4000).default(''),optionalDate=z.union([validDate,z.literal('')]).default('');
const who={responsible:text},identity={id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0)};
const service=z.enum(['Desayuno','Almuerzo','Cena']),time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schedule=z.object({start:optionalDate,end:optionalDate,weekdays:z.array(z.number().int().min(0).max(6)).max(7).default([]),interval:z.number().int().min(1).max(366).nullable().default(null),dates:z.array(validDate).max(366).default([])});
const expected=z.array(z.object({id:text,version:z.number().int().min(-1)})).max(21).default([]);
export const planningOperations=z.discriminatedUnion('action',[
 z.object({action:z.literal('supplierProfile'),data:z.object({...identity,name:text,contact:note,rubros:z.array(text).min(1).max(20),observation:note,frequency:z.enum(['Sin frecuencia','Semanal','Cada N días','Fechas puntuales']),schedule,leadDays:z.number().int().min(0).max(365).nullable().default(null),...who})}),
 z.object({action:z.literal('deliveryGenerate'),data:z.object({supplier:text,version:z.number().int().nonnegative(),from:validDate,to:validDate,...who})}),
 z.object({action:z.literal('deliveryEdit'),data:z.object({...identity,supplier:text,date:optionalDate,deadline:optionalDate,status:z.enum(['Prevista','Confirmada','Realizada','Reprogramada','Cancelada']),expense:z.string().default(''),observation:note,...who})}),
 z.object({action:z.literal('menuPlan'),data:z.object({...identity,date:validDate,service,dishes:long,alternatives:note,conditions:note,observation:note,status:z.enum(['Borrador','Confirmado']),...who})}),
 z.object({action:z.literal('menuCopy'),data:z.object({from:validDate,to:validDate,days:z.union([z.literal(1),z.literal(7)]),overwrite:z.boolean().default(false),expected,...who})}),
 z.object({action:z.literal('menuActual'),data:z.object({...identity,plan:text,dishes:long,alternatives:note,conditions:note,observation:long,...who})}),
 z.object({action:z.literal('staffEmployee'),data:z.object({...identity,name:text,role:text,contact:note,active:z.boolean(),...who})}),
 z.object({action:z.literal('staffEvent'),data:z.object({...identity,employee:text,kind:z.enum(['Turno','Franco','Vacaciones','Otra ausencia']),startDate:validDate,endDate:validDate,startTime:time.default('00:00'),endTime:time.default('00:00'),status:z.enum(['Programado','Cancelado']).default('Programado'),acknowledge:z.boolean().default(false),observation:note,...who})}),
 z.object({action:z.literal('staffAttendance'),data:z.object({id:text,version:z.number().int().nonnegative(),attendance:z.enum(['Asistencia registrada','Ausente']),actualStart:z.string().default(''),actualEnd:z.string().default(''),observation:long,...who})}),
 z.object({action:z.literal('staffReport'),data:z.object({...identity,employee:text,event:z.string().default(''),date:validDate,type:z.enum(['Tarea','Novedad','Incidencia','Seguimiento']),description:long,status:z.enum(['Pendiente','Resuelto']),followup:note,...who})}),
]);
export const planningErrors:Record<string,string>={HOT_PLANNING_INVALID:'Revisá las fechas, el responsable y los campos del registro.',HOT_EMPLOYEE_INACTIVE:'El empleado está inactivo. Su historial se conserva; no se pueden crear nuevas asignaciones.',HOT_STAFF_CONFLICT:'Hay turnos superpuestos o una ausencia en ese intervalo. Revisá la advertencia y explicá la excepción si decidís registrar la asignación.',HOT_MENU_EXISTS:'Ya existe un menú en el destino. Revisá las fechas y confirmá expresamente su reemplazo.',HOT_DELIVERY_TERMINAL:'La entrega realizada o cancelada conserva su historial y no se modifica aquí.'};
type Rows=HotelTables & PersonnelTables;
type Add=(sql:string,...values:unknown[])=>void;
export async function planPlanning(db:D1Database,action:string,input:unknown,add:Add){
 if(!planningOperations.options.some(o=>o.shape.action.value===action))return null;
 const op=planningOperations.parse({action,data:input});
 async function row<T extends keyof Rows>(table:T,id:string){return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Rows[T]>();}
 function version(old:{version:number}|null,id:string,v:number){if(id&&!old)throw Error('Registro inexistente.');if(old&&old.version!==v)throw Error('HOT_VERSION');}
 if(op.action==='supplierProfile'){
  const d=op.data,old=d.id?await row('suppliers',d.id):null;version(old,d.id,d.version);
  if(d.schedule.start&&d.schedule.end&&d.schedule.start>d.schedule.end||d.frequency==='Semanal'&&!d.schedule.weekdays.length||d.frequency==='Cada N días'&&(!d.schedule.start||!d.schedule.interval)||d.frequency==='Fechas puntuales'&&!d.schedule.dates.length)throw Error('Revisá los días, las fechas y el inicio de la frecuencia habitual.');
  const id=d.id||crypto.randomUUID(),values=[d.name,d.contact,JSON.stringify([...new Set(d.rubros)]),d.observation,d.frequency,JSON.stringify(d.schedule),d.leadDays,d.responsible];
  if(old)add('UPDATE suppliers SET name=?,contact=?,rubros=?,observation=?,frequency=?,schedule=?,lead_days=?,responsible=?,version=? WHERE id=?',...values,d.version+1,id);else add('INSERT INTO suppliers (name,contact,rubros,observation,frequency,schedule,lead_days,responsible,id) VALUES (?,?,?,?,?,?,?,?,?)',...values,id);
  return {before:old,after:{id}};
 }
 if(op.action==='deliveryGenerate'){
  const d=op.data,s=await row('suppliers',d.supplier);version(s,d.supplier,d.version);if(!s)throw Error('Proveedor inexistente.');
  if(d.from>d.to||Date.parse(d.to)-Date.parse(d.from)>365*86400000)throw Error('La generación admite hasta un año.');
  const dates=deliveryDates(s,d.from,d.to);
  for(const date of dates){const key=s.id+':'+date;add("INSERT INTO supplier_deliveries (id,supplier,source_key,original_date,date,deadline,status,expense,observation,responsible) SELECT ?,?,?,?,?,?,'Prevista',NULL,'',? WHERE NOT EXISTS(SELECT 1 FROM supplier_deliveries WHERE supplier=? AND (date=? OR original_date=?)) ON CONFLICT(source_key) DO NOTHING",'delivery:'+key,s.id,key,date,date,s.lead_days===null?null:shiftDate(date,-s.lead_days),d.responsible,s.id,date,date);}
  return {supplierVersion:{id:s.id,version:s.version},after:{dates}};
 }
 if(op.action==='deliveryEdit'){
  const d=op.data,old=d.id?await row('supplier_deliveries',d.id):null;version(old,d.id,d.version);
  if(!await row('suppliers',d.supplier))throw Error('Proveedor inexistente.');
  if(old&&['Realizada','Cancelada'].includes(old.status))throw Error('HOT_DELIVERY_TERMINAL');
  if(old&&old.supplier!==d.supplier)throw Error('La entrega pertenece a otro proveedor.');
  if(!d.date&&['Confirmada','Realizada','Reprogramada'].includes(d.status)||d.deadline&&d.date&&d.deadline>d.date)throw Error('Una entrega confirmada, realizada o reprogramada necesita fecha; el pedido debe vencer antes de la entrega.');
  if(old&&old.date!==null&&old.date!==(d.date||null)&&d.status!=='Reprogramada'&&d.status!=='Cancelada')throw Error('Para cambiar la fecha indicá Reprogramada y explicá el cambio.');
  if(d.status==='Reprogramada'&&!d.observation.trim())throw Error('Explicá la reprogramación.');
  if(d.expense&&!await db.prepare('SELECT id FROM expenses WHERE id=?').bind(d.expense).first())throw Error('Compra inexistente.');
  const id=d.id||crypto.randomUUID(),v=[d.date||null,d.deadline||null,d.status,d.expense||null,d.observation,d.responsible];
  if(old)add('UPDATE supplier_deliveries SET date=?,deadline=?,status=?,expense=?,observation=?,responsible=?,version=? WHERE id=?',...v,d.version+1,id);else add('INSERT INTO supplier_deliveries (date,deadline,status,expense,observation,responsible,id,supplier,source_key,original_date) VALUES (?,?,?,?,?,?,?,?,NULL,?)',...v,id,d.supplier,d.date||null);
  return {before:old,after:{id}};
 }
 if(op.action==='menuPlan'){
  const d=op.data,id=d.date+':'+d.service,old=await row('menu_plans',id);
  if(old&&!d.id)throw Error('HOT_MENU_EXISTS');if(d.id&&d.id!==id)throw Error('La fecha y el servicio del menú no se cambian; usá copiar.');version(old,d.id,d.version);
  const v=[d.dishes,d.alternatives,d.conditions,d.observation,d.status,d.responsible];
  if(old)add('UPDATE menu_plans SET dishes=?,alternatives=?,conditions=?,observation=?,status=?,responsible=?,version=? WHERE id=?',...v,d.version+1,id);else add('INSERT INTO menu_plans (dishes,alternatives,conditions,observation,status,responsible,id,date,service) VALUES (?,?,?,?,?,?,?,?,?)',...v,id,d.date,d.service);
  return {before:old,after:{id}};
 }
 if(op.action==='menuCopy'){
  const d=op.data,sourceEnd=shiftDate(d.from,d.days-1),targetEnd=shiftDate(d.to,d.days-1);
  if(d.from<=targetEnd&&d.to<=sourceEnd)throw Error('Elegí períodos de origen y destino que no se superpongan.');
  const source=(await db.prepare('SELECT * FROM menu_plans WHERE date>=? AND date<=?').bind(d.from,sourceEnd).all<HotelTables['menu_plans']>()).results;
  if(!source.length)throw Error('El período de origen no tiene menús para copiar.');
  const before=[];
  for(const s of source){const offset=Math.round((Date.parse(s.date)-Date.parse(d.from))/86400000),date=shiftDate(d.to,offset),id=date+':'+s.service,old=await row('menu_plans',id),expected=d.expected.find(e=>e.id===id);
   if(old&&!d.overwrite)throw Error('HOT_MENU_EXISTS');if(!expected||expected.version!==(old?.version??-1))throw Error('HOT_VERSION');before.push(old);
   const v=[s.dishes,s.alternatives,s.conditions,s.observation,'Borrador',d.responsible];
   if(old)add('UPDATE menu_plans SET dishes=?,alternatives=?,conditions=?,observation=?,status=?,responsible=?,version=? WHERE id=?',...v,old.version+1,id);else add('INSERT INTO menu_plans (dishes,alternatives,conditions,observation,status,responsible,id,date,service) VALUES (?,?,?,?,?,?,?,?,?)',...v,id,date,s.service);
  }
  return {before,sourceVersions:source.map(s=>({id:s.id,version:s.version})),after:{count:source.length}};
 }
 if(op.action==='menuActual'){
  const d=op.data,plan=await row('menu_plans',d.plan);if(!plan)throw Error('Registrá primero el menú previsto.');
  const old=await db.prepare('SELECT * FROM menu_actuals WHERE plan=?').bind(d.plan).first<HotelTables['menu_actuals']>();if(old&&!d.id)throw Error('Ya hay un menú servido registrado. Usá editar.');version(old,d.id,d.version);
  if(old&&d.id!==old.id)throw Error('Registro inexistente.');
  const id=d.id||crypto.randomUUID(),v=[d.dishes,d.alternatives,d.conditions,d.observation,d.responsible];
  if(old)add('UPDATE menu_actuals SET dishes=?,alternatives=?,conditions=?,observation=?,responsible=?,version=? WHERE id=?',...v,d.version+1,id);else add('INSERT INTO menu_actuals (dishes,alternatives,conditions,observation,responsible,id,plan,planned_snapshot) VALUES (?,?,?,?,?,?,?,?)',...v,id,plan.id,JSON.stringify(plan));
  return {before:old,planVersion:old?null:{id:plan.id,version:plan.version},after:{id}};
 }
 if(op.action==='staffEmployee'){
  const d=op.data,old=d.id?await row('employees',d.id):null;version(old,d.id,d.version);const id=d.id||crypto.randomUUID(),v=[d.name,d.role,d.contact,d.active?1:0,d.responsible];
  if(old)add('UPDATE employees SET name=?,role=?,contact=?,active=?,responsible=?,version=? WHERE id=?',...v,d.version+1,id);else add('INSERT INTO employees (name,role,contact,active,responsible,id) VALUES (?,?,?,?,?,?)',...v,id);return {before:old,after:{id}};
 }
 if(op.action==='staffEvent'){
  const d=op.data,old=d.id?await row('staff_events',d.id):null;version(old,d.id,d.version);const p=eventPeriod(d),employee=await row('employees',d.employee);
  if(!employee||!employee.active&&(!old||old.employee!==employee.id||old.start!==p.start||old.end!==p.end))throw Error('HOT_EMPLOYEE_INACTIVE');
  if(p.start>=p.end||Date.parse(p.end+'Z')-Date.parse(p.start+'Z')>366*86400000||d.kind==='Turno'&&Date.parse(p.end+'Z')-Date.parse(p.start+'Z')>24*3600000)throw Error('Revisá el intervalo; un turno puede durar hasta 24 horas y terminar al día siguiente.');
  const events=(await db.prepare('SELECT * FROM staff_events WHERE employee=?').bind(d.employee).all<PersonnelTables['staff_events']>()).results,conflicts=d.status==='Cancelado'?[]:eventConflicts(events,d.employee,p.start,p.end,d.id);
  if(conflicts.length&&(!d.acknowledge||!d.observation.trim()))throw Error('HOT_STAFF_CONFLICT');
  if(old?.attendance!=='Sin registrar'&&old&&(p.start!==old.start||p.end!==old.end||d.kind!==old.kind||d.employee!==old.employee||d.status==='Cancelado'))throw Error('El turno ya tiene asistencia registrada. Conservá sus datos; agregá una novedad para regularizarlo.');
  const id=d.id||crypto.randomUUID(),v=[d.employee,d.kind,p.start,p.end,d.status,d.acknowledge?1:0,d.observation,d.responsible];
  if(old)add('UPDATE staff_events SET employee=?,kind=?,start=?,end=?,status=?,conflict_ack=?,observation=?,responsible=?,version=? WHERE id=?',...v,d.version+1,id);else add("INSERT INTO staff_events (employee,kind,start,end,status,conflict_ack,observation,responsible,id,attendance) VALUES (?,?,?,?,?,?,?,?,?,'Sin registrar')",...v,id);
  return {before:old,conflicts:conflicts.map(e=>e.id),after:{id}};
 }
 if(op.action==='staffAttendance'){
  const d=op.data,old=await row('staff_events',d.id);version(old,d.id,d.version);if(!old||old.kind!=='Turno'||old.status==='Cancelado')throw Error('Elegí un turno programado.');
  if(d.attendance==='Asistencia registrada'){for(const value of [d.actualStart,d.actualEnd]){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Ingresá inicio y fin reales, en hora del hotel.');validDate.parse(value.slice(0,10));time.parse(value.slice(11));}if(d.actualStart>=d.actualEnd||Date.parse(d.actualEnd+'Z')-Date.parse(d.actualStart+'Z')>24*3600000)throw Error('Revisá el inicio y el fin reales.');}
  add('UPDATE staff_events SET attendance=?,actual_start=?,actual_end=?,observation=?,responsible=?,version=? WHERE id=?',d.attendance,d.attendance==='Ausente'?null:d.actualStart,d.attendance==='Ausente'?null:d.actualEnd,d.observation,d.responsible,d.version+1,d.id);return {before:old};
 }
 if(op.action==='staffReport'){
  const d=op.data,old=d.id?await row('staff_reports',d.id):null;version(old,d.id,d.version);const employee=await row('employees',d.employee);
  if(!employee||!old&&!employee.active)throw Error('HOT_EMPLOYEE_INACTIVE');
  if(old&&(old.employee!==d.employee||old.event!==(d.event||null)||old.date!==d.date||old.type!==d.type))throw Error('Conservá empleado, turno, fecha y tipo originales; agregá otro reporte si corresponde.');
  if(d.event){const event=await row('staff_events',d.event);if(!event||event.employee!==d.employee)throw Error('El turno no pertenece al empleado.');}
  if(d.status==='Resuelto'&&!d.followup.trim())throw Error('Explicá cómo se resolvió la novedad.');
  const id=d.id||crypto.randomUUID();if(old)add('UPDATE staff_reports SET description=?,status=?,followup=?,version=? WHERE id=?',d.description,d.status,d.followup,d.version+1,id);else add('INSERT INTO staff_reports (id,employee,event,date,author,type,description,status,followup) VALUES (?,?,?,?,?,?,?,?,?)',id,d.employee,d.event||null,d.date,d.responsible,d.type,d.description,d.status,d.followup);return {before:old,after:{id}};
 }
 return {};
}
