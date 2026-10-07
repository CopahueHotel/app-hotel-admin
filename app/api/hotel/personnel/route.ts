import { database } from '@/lib/hotel-db';
import { sessionIdentity, accessGuard } from '@/lib/hotel-auth';
import { can } from '@/modules/access/permissions';
import { staffActions } from '@/lib/hotel-planning';
export const dynamic='force-dynamic';
// Personnel and internal reports have separate permissions. These records
// never enter the operational response used by reception or kitchen.
export async function GET(req:Request){
 const identity=await sessionIdentity(req);if(identity instanceof Response)return identity;
 if(!can(identity,'personnel.view'))return Response.json({error:'No tenés acceso a Personal.'},{status:403});
 try{
  const db=database(),reports=can(identity,'personnel.reports'),tables=['employees','staff_events',...(reports?['staff_reports']:[]),'audit_log'],guard=accessGuard(db,identity);
  const result=await db.batch([guard.start,...tables.map(t=>db.prepare(t==='audit_log'?`SELECT * FROM audit_log WHERE action IN (${staffActions.filter(a=>reports||a!=='staffReport').map(a=>"'"+a+"'").join(',')})`:`SELECT * FROM ${t}`)),guard.end]);
  return Response.json({staff_reports:[],...Object.fromEntries(tables.map((t,i)=>[t,result[i+1].results]))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'No se pudo cargar Personal. Intentá nuevamente.'},{status:503});}
}
