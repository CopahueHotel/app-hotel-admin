import { z } from 'zod';
import { customerSchema,customerDetails,inquirySchema,emailKey,phoneKey } from '@/modules/customers/domain';
import type { Customer,Inquiry } from '@/modules/customers/types';
import { can,type Identity } from '@/modules/access/permissions';
type Add=(sql:string,...values:unknown[])=>void;
export const customerOperations=z.discriminatedUnion('action',[
 z.object({action:z.literal('customerSave'),data:customerSchema}),
 z.object({action:z.literal('inquirySave'),data:inquirySchema}),
]);
async function validateDuplicates(db:D1Database,input:typeof customerDetails._output){
 if(input.duplicateConfirmed||(!input.email&&!phoneKey(input.phone)))return;
 if(await db.prepare("SELECT id FROM customers WHERE (?<>'' AND email_key=?) OR (?<>'' AND phone_key=?) LIMIT 1").bind(emailKey(input.email),emailKey(input.email),phoneKey(input.phone),phoneKey(input.phone)).first())throw Error('Hay clientes con ese email o teléfono. Seleccioná la ficha existente o confirmá que son personas distintas.');
}
export function insertCustomer(add:Add,input:typeof customerDetails._output,identity:Identity,id=crypto.randomUUID()){
 const timestamp=new Date().toISOString();
 add('INSERT INTO customers (id,name,email,phone,email_key,phone_key,locality,province,country,origin,created,updated,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,input.name,input.email,input.phone,emailKey(input.email),phoneKey(input.phone),input.locality,input.province,input.country,input.origin,timestamp,timestamp,identity.id,identity.id);
 return id;
}
export async function planCustomer(db:D1Database,action:string,input:unknown,add:Add,identity:Identity){
 if(action!=='customerSave'&&action!=='inquirySave')return null;
 const op=customerOperations.parse({action,data:input}),timestamp=new Date().toISOString();
 if(op.action==='customerSave'){
  const d=op.data,old=d.id?await db.prepare('SELECT * FROM customers WHERE id=?').bind(d.id).first<Customer>():null;
  if(d.id&&(!old||old.version!==d.version))throw Error('HOT_VERSION');
  if(d.notes!==undefined&&!can(identity,'customers.notes'))throw Error('HOT_FORBIDDEN');
  const consent=d.consent??old?.consent??'Sin información';
  const changed=consent!==(old?.consent??'Sin información');
  if(changed&&!can(identity,'customers.consent'))throw Error('HOT_FORBIDDEN');
  if(changed&&(!d.consentDate||!d.consentSource))throw Error('El consentimiento requiere fecha y origen de la autorización o revocación.');
  if(!old)await validateDuplicates(db,d);
  const id=d.id||insertCustomer(add,d,identity);
  if(old)add('UPDATE customers SET name=?,email=?,phone=?,email_key=?,phone_key=?,locality=?,province=?,country=?,origin=?,notes=?,consent=?,consent_date=?,consent_source=?,consent_by=?,updated=?,updated_by=?,version=? WHERE id=?',d.name,d.email,d.phone,emailKey(d.email),phoneKey(d.phone),d.locality,d.province,d.country,d.origin,d.notes??old.notes,consent,changed?d.consentDate:old.consent_date,changed?d.consentSource:old.consent_source,changed?identity.id:old.consent_by,timestamp,identity.id,d.version+1,id);
  else if(d.notes||changed)add('UPDATE customers SET notes=?,consent=?,consent_date=?,consent_source=?,consent_by=?,version=1 WHERE id=?',d.notes??'',consent,changed?d.consentDate:'',changed?d.consentSource:'',changed?identity.id:'',id);
  return {before:old,after:{customer:id}};
 }
 const d=op.data,old=d.id?await db.prepare('SELECT * FROM customer_inquiries WHERE id=?').bind(d.id).first<Inquiry>():null;
 if(d.id&&(!old||old.version!==d.version))throw Error('HOT_VERSION');
 if(!await db.prepare('SELECT id FROM customers WHERE id=?').bind(d.customer).first())throw Error('Cliente inexistente.');
 if(d.notes!==undefined&&!can(identity,'customers.notes'))throw Error('HOT_FORBIDDEN');
 if(d.start&&d.end&&d.start>=d.end)throw Error('La salida solicitada debe ser posterior a la llegada.');
 if(old?.status==='Convertida en reserva'||d.status==='Convertida en reserva')throw Error('La conversión se registra al crear la reserva; una consulta convertida conserva su historial.');
 if(old&&old.customer!==d.customer)throw Error('La consulta conserva su cliente original.');
 if(old)add('UPDATE customer_inquiries SET date=?,channel=?,start=?,end=?,pax=?,status=?,notes=?,next_action=?,followup=?,updated=?,updated_by=?,version=? WHERE id=?',d.date,d.channel,d.start,d.end,d.pax,d.status,d.notes??old.notes,d.nextAction,d.followup,timestamp,identity.id,d.version+1,d.id);
 else add('INSERT INTO customer_inquiries (id,customer,date,channel,start,end,pax,status,notes,next_action,followup,created,updated,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),d.customer,d.date,d.channel,d.start,d.end,d.pax,d.status,d.notes??'',d.nextAction,d.followup,timestamp,timestamp,identity.id,identity.id);
 return {before:old};
}
export async function reservationCustomer(db:D1Database,d:{customerId?:string;customer?:typeof customerDetails._output;inquiryId?:string;inquiryVersion?:number;guest:string;phone:string},add:Add,identity:Identity,booking:string,oldBooking?:string){
 const link=oldBooking?await db.prepare('SELECT customer,inquiry FROM booking_clients WHERE booking=?').bind(oldBooking).first<{customer:string;inquiry:string|null}>():null;
 let id=d.customerId||link?.customer;
 if(id){
  if(d.customerId&&d.customerId!==link?.customer&&!can(identity,'customers.lookup')&&!can(identity,'customers.view'))throw Error('HOT_FORBIDDEN');
  const customer=await db.prepare('SELECT id,name,phone FROM customers WHERE id=?').bind(id).first<Customer>();
  if(!customer)throw Error('Cliente inexistente.');
  // The booking's historic contact is retained. Display reads use the client.
  if(!oldBooking){d.guest=customer.name;d.phone=customer.phone;}
 }else{
  if(!can(identity,'customers.create'))throw Error('HOT_FORBIDDEN');
  const details=d.customer??customerDetails.parse({name:d.guest,phone:d.phone});
  await validateDuplicates(db,details);
  id=insertCustomer(add,details,identity);
  d.guest=details.name;d.phone=details.phone;
 }
 let converted:Inquiry|null=null;
 if(d.inquiryId){
  if(oldBooking||!can(identity,'customers.edit'))throw Error('HOT_FORBIDDEN');
  const inquiry=await db.prepare('SELECT * FROM customer_inquiries WHERE id=?').bind(d.inquiryId).first<Inquiry>();
  if(!inquiry||inquiry.customer!==id||inquiry.version!==d.inquiryVersion||['Convertida en reserva','Cerrada sin reserva'].includes(inquiry.status))throw Error('La consulta cambió, está cerrada o pertenece a otro cliente.');
  converted=inquiry;
 }
 if(link?.inquiry&&id!==link.customer)throw Error('La reserva conserva el cliente de la consulta original.');
 return {id,finish(){
  if(!link)add('INSERT INTO booking_clients (booking,customer,inquiry) VALUES (?,?,?)',booking,id,d.inquiryId||null);
  else if(id!==link.customer)add('UPDATE booking_clients SET customer=? WHERE booking=?',id,booking);
  if(converted)add("UPDATE customer_inquiries SET status='Convertida en reserva',updated=?,updated_by=?,version=version+1 WHERE id=? AND version=?",new Date().toISOString(),identity.id,converted.id,converted.version);
 }};
}
