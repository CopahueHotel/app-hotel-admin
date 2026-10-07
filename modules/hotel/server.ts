import { accessGuard,checkOrigin,sessionIdentity } from '@/lib/hotel-auth';
import { database } from '@/lib/hotel-db';
import { mealOperations,planMeals } from '@/lib/hotel-meal-api';
import { planPlanning,planningErrors,planningOperations } from '@/lib/hotel-planning-api';
import { planReservation,reservationOperations } from '@/lib/hotel-reservation-api';
import { planSupply,supplyErrors,supplyOperations } from '@/lib/hotel-supply-api';
import { authorizeOperation } from '@/modules/access/authorize';
import { readHotelData } from '@/modules/access/data';
import { planUsers,userOperations } from '@/modules/access/operations';
import { can } from '@/modules/access/permissions';
import { legacyOperations as cashLegacy,planLegacy as cashPlan } from '@/modules/cash/legacy-operations';
import { seed } from '@/modules/hotel/seed';
import { legacyOperations as purchasesLegacy,planLegacy as purchasesPlan } from '@/modules/purchases/legacy-operations';
import { legacyOperations as reservationsLegacy,planLegacy as reservationsPlan } from '@/modules/reservations/legacy-operations';
import { legacyOperations as restaurantLegacy,planLegacy as restaurantPlan } from '@/modules/restaurant/legacy-operations';
import { legacyOperations as roomsLegacy,planLegacy as roomsPlan } from '@/modules/rooms/legacy-operations';
import { legacyOperations as settingsLegacy,planLegacy as settingsPlan } from '@/modules/settings/legacy-operations';
import { operationContext } from '@/modules/shared/operations';
import { legacyOperations as stockLegacy,planLegacy as stockPlan } from '@/modules/stock/legacy-operations';
import { z } from 'zod';
export const dynamic='force-dynamic';
const operationSchema=z.discriminatedUnion('action',[
 ...userOperations.options,
 ...planningOperations.options,
 ...supplyOperations.options,
 ...mealOperations.options,
 ...reservationOperations.options,
 ...reservationsLegacy.options,
 ...roomsLegacy.options,
 ...restaurantLegacy.options,
 ...purchasesLegacy.options,
 ...stockLegacy.options,
 ...cashLegacy.options,
 ...settingsLegacy.options,
]);
const id=()=>crypto.randomUUID();
export async function GET(req:Request){
 const identity=await sessionIdentity(req);if(identity instanceof Response)return identity;
 const exportModule=new URL(req.url).searchParams.get('export');
 if(exportModule&&!can(identity,exportModule+'.export'))return Response.json({error:'No tenés permiso para exportar.'},{status:403});
 try{const db=database();await seed(db);return Response.json(await readHotelData(db,identity),{headers:{'Cache-Control':'no-store'}});}
 catch(e){console.error(e);return Response.json({error:'No se pudieron cargar los registros. Actualizá e intentá nuevamente.'},{status:e instanceof Error&&e.message.includes('HOT_ACCESS_CHANGED')?403:503});}
}
export async function POST(req:Request){
const identity=await sessionIdentity(req);if(identity instanceof Response)return identity;const originError=checkOrigin(req);if(originError)return originError;
let requestKey:string|undefined, fingerprint:string|undefined, requestDb:D1Database|undefined;
try{const raw=await req.json() as {action:string;data:Record<string,unknown>};
const {action,data:d}=operationSchema.parse({action:raw.action,data:{...raw.data,responsible:identity.name}});
await authorizeOperation(database(),identity,action,d as Record<string,unknown>);const db=database();requestDb=db;await seed(db);
requestKey=z.string().uuid().parse(req.headers.get('Idempotency-Key'));
fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({user:identity.id,action:action,data:d}))))).map(v=>v.toString(16).padStart(2,'0')).join('');
const previous=await db.prepare('SELECT fingerprint FROM operation_requests WHERE key=?').bind(requestKey).first<{fingerprint:string}>();
if(previous)return Response.json(previous.fingerprint===fingerprint?{ok:true}:{error:'La clave de operacion ya se uso con otros datos.'},{status:previous.fingerprint===fingerprint?200:409});
const actor=identity.name;const stmts:D1PreparedStatement[]=[];const add=(sql:string,...v:unknown[])=>stmts.push(db.prepare(sql).bind(...v));
const guard=accessGuard(db,identity);stmts.push(guard.start);
add('INSERT INTO operation_requests (key,fingerprint,created,user_id) VALUES (?,?,?,?)',requestKey,fingerprint,new Date().toISOString(),identity.id);
if('date' in d&&d.date&&['sale','payment','expense','payExpense','stock','purchase','transfer','movement','meal'].includes(action)){if(await db.prepare('SELECT date FROM daily_closes WHERE date>=? LIMIT 1').bind(d.date).first())throw new Error('Ese día ya está cerrado. Usá una fecha posterior al último cierre.');}

const userChange=await planUsers(db,action,d,add,identity);
const reservationChange=await planReservation(db,action,d,add);
const mealChange=await planMeals(db,action,d,add);
const supplyChange=await planSupply(db,action,d,add);
const planningChange=await planPlanning(db,action,d,add);
const context=operationContext(db,add,actor);
await reservationsPlan(action,d,context);
await roomsPlan(action,d,context);
await restaurantPlan(action,d,context);
await purchasesPlan(action,d,context);
await stockPlan(action,d,context);
await cashPlan(action,d,context);
await settingsPlan(action,d,context);
const change=userChange||reservationChange||mealChange||supplyChange||planningChange;
const auditInput=userChange?{...d,password:undefined}:d;
add('INSERT INTO audit_log (id,created,actor,action,detail,actor_id) VALUES (?,?,?,?,?,?)',id(),new Date().toISOString(),actor,action,JSON.stringify(change?{input:auditInput,...change}:auditInput),identity.id);
stmts.push(guard.end);await db.batch(stmts);return Response.json({ok:true});}catch(e:unknown){
 // A concurrent identical request can win after our first lookup or validation.
 if(requestDb&&requestKey&&fingerprint){
  const saved=await requestDb.prepare('SELECT fingerprint FROM operation_requests WHERE key=?').bind(requestKey).first<{fingerprint:string}>();
  if(saved)return Response.json(saved.fingerprint===fingerprint?{ok:true}:{error:'La clave de operacion ya se uso con otros datos.'},{status:saved.fingerprint===fingerprint?200:409});
 }
 if(e instanceof Error&&/HOT_FORBIDDEN|HOT_ACCESS_CHANGED/.test(e.message))return Response.json({error:'Tu acceso cambió o no tenés permiso. Actualizá la pantalla.'},{status:403});
 console.error(e);const hotErrors:Record<string,string>={HOT_LAST_SUPERADMIN:'Debe quedar al menos un superadministrador activo.',HOT_SUPERADMIN_FIXED:'Los permisos de usuarios y superadministración están reservados.',HOT_USER_INVALID:'Revisá el usuario y sus roles.',...supplyErrors,...planningErrors,HOT_MEAL_PLAN_CONFLICT:'Ese cambio duplicaría una previsión adicional ya registrada. Revisala antes de modificar el régimen o la elección.',HOT_MEAL_LEGACY:'Hay servicios históricos sin atribución individual. Requieren revisión antes de registrar otro servicio.',HOT_MEAL_INVALID:'Revisá las personas, fechas y servicio. Una previsión adicional no debe duplicar una comida incluida.',HOT_MEAL_SUSPENDED:'La comida está suspendida o supera las personas disponibles.',HOT_MEAL_SERVED:'La comida ya fue servida; requiere revisión.',HOT_RATE_OVERLAP:'Las vigencias se superponen para ese tipo y regimen.',HOT_VERSION:'El registro cambio. Actualiza y revisa antes de guardar.',HOT_RATE_CHANGED:'Las tarifas cambiaron. Actualiza la cotizacion.',HOT_UNAVAILABLE:'Habitacion no disponible para esas noches: reserva o mantenimiento.',HOT_PRICE_PAID:'El nuevo alojamiento queda por debajo de los cobros existentes. Requiere regularizacion.',HOT_REGULARIZATION:'La reserva tiene pagos o consumos; requiere regularizacion.',HOT_CONSUMPTIONS:'El cambio dejaria consumos fuera de la estadia o alteraria un regimen ya servido.',HOT_BOOKING_CLOSED:'La reserva ya esta cerrada.',HOT_PRICE_INVALID:'Revisa el precio base y el descuento.',HOT_SPECIAL_REASON:'El acuerdo especial necesita motivo y responsable.',HOT_BARTER_INVALID:'Revisa el acuerdo de canje.',HOT_BALANCE_PENDING:'Hay un saldo pendiente antes de finalizar.',HOT_RATE_INVALID:'Revisa la tarifa y su vigencia.',HOT_BLOCK_INVALID:'Revisa las fechas y el motivo del bloqueo.',HOT_BOOKING_INVALID:'Revisa las fechas, habitacion y personas.'};const code=Object.keys(hotErrors).find(key=>e instanceof Error&&e.message.includes(key));if(code)return Response.json({error:hotErrors[code]},{status:code==='HOT_VERSION'||code==='HOT_RATE_CHANGED'?409:400});let msg=e instanceof z.ZodError?'Revisá los campos y las fechas del formulario.':e instanceof Error?e.message:'No se pudo guardar.';if(/UNIQUE constraint.*room_nights/.test(msg))msg='La habitación ya tiene una reserva en esas fechas.';else if(/UNIQUE constraint/.test(msg))msg='Ese registro ya existe.';else if(/Ese dia ya esta cerrado/.test(msg))msg='Ese día ya está cerrado. Usá una fecha posterior al último cierre.';else if(/Ya se sirvio otra comida/.test(msg))msg='Ya se sirvió otra comida incluida ese día; no se puede cambiar la elección.';else if(/comidas incluidas para ese dia/.test(msg))msg='La cantidad supera las comidas incluidas para ese día.';else if(/Explica la diferencia de caja/.test(msg))msg='Explicá la diferencia de caja.';else if(/La fecha debe ser posterior al ultimo cierre/.test(msg))msg='La fecha debe ser posterior al último cierre.';else if(/Esa comida no esta incluida/.test(msg))msg='Esa comida no está incluida en la estadía.';else if(/D1_|SQLITE_|constraint/i.test(msg))msg='No se pudo guardar. Revisá la disponibilidad e intentá nuevamente.';return Response.json({error:msg},{status:400});}}
