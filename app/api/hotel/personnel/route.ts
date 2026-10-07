import { database } from '@/lib/hotel-db';
import { requireSession } from '@/lib/hotel-auth';
import { staffActions } from '@/lib/hotel-planning';
export const dynamic='force-dynamic';
// Staff records are fetched only by the personnel screen. The prototype still
// uses one shared session; this separation does not claim role authorization.
export async function GET(req:Request){
 const rejected=await requireSession(req);if(rejected)return rejected;
 try{
  const db=database(),tables=['employees','staff_events','staff_reports','audit_log'];
  const result=await db.batch(tables.map(t=>db.prepare(t==='audit_log'?`SELECT * FROM audit_log WHERE action IN (${staffActions.map(a=>"'"+a+"'").join(',')})`:`SELECT * FROM ${t}`)));
  return Response.json(Object.fromEntries(tables.map((t,i)=>[t,result[i].results])),{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'No se pudo cargar Personal. Intentá nuevamente.'},{status:503});}
}
