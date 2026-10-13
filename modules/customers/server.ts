import { database } from '@/lib/hotel-db';
import { sessionIdentity,accessGuard } from '@/lib/hotel-auth';
import { can } from '@/modules/access/permissions';
import { emailKey,phoneKey,pendingInquiry } from '@/modules/customers/domain';
import type { Customer,CustomersData } from '@/modules/customers/types';
import { serializeCsv } from '@/lib/hotel-view';
export async function GET(request:Request){
 const identity=await sessionIdentity(request);if(identity instanceof Response)return identity;
 const query=new URL(request.url).searchParams,lookup=query.has('lookup');
 if(!can(identity,lookup?'customers.lookup':'customers.view')&&!(lookup&&can(identity,'customers.view')))return Response.json({error:'No tenés acceso a Clientes.'},{status:403});
 if(query.has('export')&&!can(identity,'customers.export'))return Response.json({error:'No tenés permiso para exportar contactos.'},{status:403});
 try{
  const db=database(),guard=accessGuard(db,identity);
  if(lookup){
   const search=(query.get('lookup')??'').trim().slice(0,240),id=(query.get('id')??'').slice(0,240);
   const email=emailKey(query.get('email')??''),phone=phoneKey(query.get('phone')??'');
   const pattern='%'+search.replace(/[!%_]/g,'!$&')+'%';
   let sql='SELECT id,name,email,phone FROM customers WHERE 0',values:string[]=[];
   if(email||phone){sql="SELECT id,name,email,phone FROM customers WHERE (?<>'' AND email_key=?) OR (?<>'' AND phone_key=?)";values=[email,email,phone,phone];}
   else if(id){sql='SELECT id,name,email,phone FROM customers WHERE id=?';values=[id];}
   else if(search.length>=2){sql="SELECT id,name,email,phone FROM customers WHERE name LIKE ? ESCAPE '!' OR email_key LIKE ? ESCAPE '!' OR (?<>'' AND phone_key LIKE ?)";values=[pattern,pattern.toLowerCase(),phoneKey(search),'%'+phoneKey(search)+'%'];}
   const result=await db.batch([guard.start,db.prepare(sql+' ORDER BY name LIMIT 20').bind(...values),guard.end]);
   return Response.json({customers:result[1].results},{headers:{'Cache-Control':'no-store'}});
  }
  const notes=can(identity,'customers.notes'),reservations=can(identity,'reservations.view');
  const customerCols='id,name,email,phone,email_key,phone_key,locality,province,country,origin,consent,consent_date,consent_source,consent_by,created,updated,created_by,updated_by,legacy,version';
  const inquiryCols='id,customer,date,channel,start,end,pax,status,next_action,followup,created,updated,created_by,updated_by,version';
  const statements=[db.prepare('SELECT '+customerCols+(notes?',notes':'')+' FROM customers ORDER BY name'),db.prepare('SELECT '+inquiryCols+(notes?',notes':'')+' FROM customer_inquiries ORDER BY date DESC'),db.prepare('SELECT * FROM booking_clients'),db.prepare("SELECT l.customer,COUNT(*) bookings,SUM(CASE WHEN b.status IN ('Alojado','Finalizada') THEN 1 ELSE 0 END) stays FROM booking_clients l JOIN bookings b ON b.id=l.booking GROUP BY l.customer"),db.prepare("SELECT id,created,actor,action,CASE WHEN json_valid(detail) THEN COALESCE(json_extract(detail,'$.after.customer'),json_extract(detail,'$.input.customer'),CASE WHEN action='customerSave' THEN json_extract(detail,'$.input.id') END) END AS customer"+(notes?",CASE WHEN action IN ('customerSave','inquirySave') THEN detail END AS detail":"")+" FROM audit_log WHERE action IN ('customerSave','inquirySave','booking','bookingEdit') ORDER BY created DESC"),db.prepare(reservations?'SELECT id,room,start,end,status FROM bookings':'SELECT id,room,start,end,status FROM bookings WHERE 0')];
  const result=await db.batch([guard.start,...statements,guard.end]);
  const data={customers:result[1].results,inquiries:result[2].results,links:result[3].results,counts:result[4].results,audit_log:result[5].results,bookings:result[6].results} as CustomersData;
  if(query.has('export')){
   const search=(query.get('q')??'').toLowerCase(),origin=query.get('origin')??'Todos',kind=query.get('kind')??'Todos',consent=query.get('consent')??'Todos';
   const contacts=data.customers.filter(c=>(!search||([c.name,c.email,c.phone,c.phone_key].some(v=>v.toLowerCase().includes(search))||phoneKey(search)&&c.phone_key.includes(phoneKey(search))))&&(origin==='Todos'||c.origin===origin)&&(consent==='Todos'||c.consent===consent)&&(kind==='Todos'||kind==='Con estadías'&&data.counts.some(n=>n.customer===c.id&&n.stays>0)||kind==='Consultas pendientes'&&data.inquiries.some(i=>i.customer===c.id&&pendingInquiry(i.status))));
   const rows=[['Nombre','Email','Teléfono / WhatsApp','Localidad','Provincia','País','Origen','Consentimiento promocional','Fecha de consentimiento','Origen del consentimiento'],...contacts.map((c:Omit<Customer,'notes'>)=>[c.name,c.email,c.phone,c.locality,c.province,c.country,c.origin,c.consent,c.consent_date,c.consent_source])];
   return new Response(serializeCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="clientes.csv"','Cache-Control':'no-store'}});
  }
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error(error);return Response.json({error:'No se pudo cargar Clientes. Actualizá e intentá nuevamente.'},{status:error instanceof Error&&error.message.includes('HOT_ACCESS_CHANGED')?403:503});}
}
