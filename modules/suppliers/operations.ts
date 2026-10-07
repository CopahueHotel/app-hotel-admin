import { deliveryDates,shiftDate } from '@/lib/hotel-planning';
import { validDate } from '@/lib/hotel-reservations';
import type { HotelTables,PersonnelTables } from '@/lib/hotel-types';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),note=z.string().max(4000).default(''),optionalDate=z.union([validDate,z.literal('')]).default('');
const who={responsible:text},identity={id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0)};

const schedule=z.object({start:optionalDate,end:optionalDate,weekdays:z.array(z.number().int().min(0).max(6)).max(7).default([]),interval:z.number().int().min(1).max(366).nullable().default(null),dates:z.array(validDate).max(366).default([])});

export const planningErrors:Record<string,string>={HOT_PLANNING_INVALID:'Revisá las fechas, el responsable y los campos del registro.',HOT_EMPLOYEE_INACTIVE:'El empleado está inactivo. Su historial se conserva; no se pueden crear nuevas asignaciones.',HOT_STAFF_CONFLICT:'Hay turnos superpuestos o una ausencia en ese intervalo. Revisá la advertencia y explicá la excepción si decidís registrar la asignación.',HOT_MENU_EXISTS:'Ya existe un menú en el destino. Revisá las fechas y confirmá expresamente su reemplazo.',HOT_DELIVERY_TERMINAL:'La entrega realizada o cancelada conserva su historial y no se modifica aquí.'};
type Rows=HotelTables & PersonnelTables;
type Add=(sql:string,...values:unknown[])=>void;
export const planningOperations=z.discriminatedUnion('action',[z.object({action:z.literal('supplierProfile'),data:z.object({...identity,name:text,contact:note,rubros:z.array(text).min(1).max(20),observation:note,frequency:z.enum(['Sin frecuencia','Semanal','Cada N días','Fechas puntuales']),schedule,leadDays:z.number().int().min(0).max(365).nullable().default(null),...who})}),
z.object({action:z.literal('deliveryGenerate'),data:z.object({supplier:text,version:z.number().int().nonnegative(),from:validDate,to:validDate,...who})}),
z.object({action:z.literal('deliveryEdit'),data:z.object({...identity,supplier:text,date:optionalDate,deadline:optionalDate,status:z.enum(['Prevista','Confirmada','Realizada','Reprogramada','Cancelada']),expense:z.string().default(''),observation:note,...who})})]);
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
 return {};
}
