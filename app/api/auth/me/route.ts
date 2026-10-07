import { sessionIdentity, accessGuard } from '@/lib/hotel-auth';
import { database } from '@/lib/hotel-db';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const identity=await sessionIdentity(req);if(identity instanceof Response)return identity;
 try{const db=database(),guard=accessGuard(db,identity);await db.batch([guard.start,guard.end]);
 return Response.json({id:identity.id,name:identity.name,email:identity.email,roles:identity.roles,permissions:identity.permissions},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'El acceso cambió. Actualizá la pantalla.'},{status:403});}
}
