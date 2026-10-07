import { eventConflicts,eventPeriod } from '@/lib/hotel-planning';
import { validDate } from '@/lib/hotel-reservations';
import type { HotelTables,PersonnelTables } from '@/lib/hotel-types';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),long=z.string().trim().min(1).max(4000),note=z.string().max(4000).default('');
const who={responsible:text},identity={id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0)};
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);


export const planningErrors:Record<string,string>={HOT_PLANNING_INVALID:'Revisá las fechas, el responsable y los campos del registro.',HOT_EMPLOYEE_INACTIVE:'El empleado está inactivo. Su historial se conserva; no se pueden crear nuevas asignaciones.',HOT_STAFF_CONFLICT:'Hay turnos superpuestos o una ausencia en ese intervalo. Revisá la advertencia y explicá la excepción si decidís registrar la asignación.',HOT_MENU_EXISTS:'Ya existe un menú en el destino. Revisá las fechas y confirmá expresamente su reemplazo.',HOT_DELIVERY_TERMINAL:'La entrega realizada o cancelada conserva su historial y no se modifica aquí.'};
type Rows=HotelTables & PersonnelTables;
type Add=(sql:string,...values:unknown[])=>void;
export const planningOperations=z.discriminatedUnion('action',[z.object({action:z.literal('staffEmployee'),data:z.object({...identity,name:text,role:text,contact:note,active:z.boolean(),...who})}),
z.object({action:z.literal('staffEvent'),data:z.object({...identity,employee:text,kind:z.enum(['Turno','Franco','Vacaciones','Otra ausencia']),startDate:validDate,endDate:validDate,startTime:time.default('00:00'),endTime:time.default('00:00'),status:z.enum(['Programado','Cancelado']).default('Programado'),acknowledge:z.boolean().default(false),observation:note,...who})}),
z.object({action:z.literal('staffAttendance'),data:z.object({id:text,version:z.number().int().nonnegative(),attendance:z.enum(['Asistencia registrada','Ausente']),actualStart:z.string().default(''),actualEnd:z.string().default(''),observation:long,...who})}),
z.object({action:z.literal('staffReport'),data:z.object({...identity,employee:text,event:z.string().default(''),date:validDate,type:z.enum(['Tarea','Novedad','Incidencia','Seguimiento']),description:long,status:z.enum(['Pendiente','Resuelto']),followup:note,...who})})]);
export async function planPlanning(db:D1Database,action:string,input:unknown,add:Add){
 if(!planningOperations.options.some(o=>o.shape.action.value===action))return null;
 const op=planningOperations.parse({action,data:input});
async function row<T extends keyof Rows>(table:T,id:string){return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Rows[T]>();}
function version(old:{version:number}|null,id:string,v:number){if(id&&!old)throw Error('Registro inexistente.');if(old&&old.version!==v)throw Error('HOT_VERSION');}
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
