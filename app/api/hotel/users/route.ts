import { database } from '@/lib/hotel-db';
import { sessionIdentity, accessGuard } from '@/lib/hotel-auth';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const identity=await sessionIdentity(req);if(identity instanceof Response)return identity;
 if(!identity.roles.includes('superadmin'))return Response.json({error:'Solo un superadministrador puede gestionar usuarios y permisos.'},{status:403});
 try{const db=database(),guard=accessGuard(db,identity);
  const result=await db.batch([guard.start,db.prepare('SELECT id,name,email,active,roles,version FROM users'),db.prepare('SELECT * FROM roles'),db.prepare("SELECT * FROM audit_log WHERE action IN ('userSave','userReset','rolePermissions','bootstrapAdmin')"),guard.end]);
  return Response.json({users:result[1].results,roles:result[2].results,audit_log:result[3].results},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'No se pudo cargar la gestión de usuarios. Actualizá la pantalla.'},{status:503});}
}
