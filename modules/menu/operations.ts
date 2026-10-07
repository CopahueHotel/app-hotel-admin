import { shiftDate } from '@/lib/hotel-planning';
import { validDate } from '@/lib/hotel-reservations';
import type { HotelTables,PersonnelTables } from '@/lib/hotel-types';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),long=z.string().trim().min(1).max(4000),note=z.string().max(4000).default('');
const who={responsible:text},identity={id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0)};
const service=z.enum(['Desayuno','Almuerzo','Cena']);

const expected=z.array(z.object({id:text,version:z.number().int().min(-1)})).max(21).default([]);
export const planningErrors:Record<string,string>={HOT_PLANNING_INVALID:'Revisá las fechas, el responsable y los campos del registro.',HOT_EMPLOYEE_INACTIVE:'El empleado está inactivo. Su historial se conserva; no se pueden crear nuevas asignaciones.',HOT_STAFF_CONFLICT:'Hay turnos superpuestos o una ausencia en ese intervalo. Revisá la advertencia y explicá la excepción si decidís registrar la asignación.',HOT_MENU_EXISTS:'Ya existe un menú en el destino. Revisá las fechas y confirmá expresamente su reemplazo.',HOT_DELIVERY_TERMINAL:'La entrega realizada o cancelada conserva su historial y no se modifica aquí.'};
type Rows=HotelTables & PersonnelTables;
type Add=(sql:string,...values:unknown[])=>void;
export const planningOperations=z.discriminatedUnion('action',[z.object({action:z.literal('menuPlan'),data:z.object({...identity,date:validDate,service,dishes:long,alternatives:note,conditions:note,observation:note,status:z.enum(['Borrador','Confirmado']),...who})}),
z.object({action:z.literal('menuCopy'),data:z.object({from:validDate,to:validDate,days:z.union([z.literal(1),z.literal(7)]),overwrite:z.boolean().default(false),expected,...who})}),
z.object({action:z.literal('menuActual'),data:z.object({...identity,plan:text,dishes:long,alternatives:note,conditions:note,observation:long,...who})})]);
export async function planPlanning(db:D1Database,action:string,input:unknown,add:Add){
 if(!planningOperations.options.some(o=>o.shape.action.value===action))return null;
 const op=planningOperations.parse({action,data:input});
async function row<T extends keyof Rows>(table:T,id:string){return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Rows[T]>();}
function version(old:{version:number}|null,id:string,v:number){if(id&&!old)throw Error('Registro inexistente.');if(old&&old.version!==v)throw Error('HOT_VERSION');}
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
 return {};
}
