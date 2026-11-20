import { database } from '@/lib/hotel-db';
import { accessGuard,sessionIdentity } from '@/lib/hotel-auth';
import { can } from '@/modules/access/permissions';
import { attachmentBytes } from '@/modules/purchases/attachments';
export async function GET(request:Request){
 const identity=await sessionIdentity(request);if(identity instanceof Response)return identity;
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"};
 if(!can(identity,'purchases.view')||!can(identity,'purchases.financial'))return Response.json({error:'No tenés permiso para consultar comprobantes adjuntos.'},{status:403,headers});
 const id=new URL(request.url).searchParams.get('id');if(!id||!zUuid(id))return Response.json({error:'Adjunto inexistente.'},{status:404,headers});
 try{const db=database(),guard=accessGuard(db,identity),result=await db.batch([guard.start,db.prepare('SELECT name,mime,content FROM purchase_attachments WHERE id=?').bind(id),guard.end]);
  const file=result[1].results[0] as {name:string;mime:'application/pdf'|'image/jpeg'|'image/png'|'image/webp';content:string}|undefined;
  if(!file)return Response.json({error:'Adjunto inexistente.'},{status:404,headers});
  return new Response(attachmentBytes(file).buffer,{headers:{...headers,'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`}});
 }catch(error){return Response.json({error:'No se pudo descargar el comprobante.'},{status:error instanceof Error&&error.message.includes('HOT_ACCESS_CHANGED')?403:503,headers});}
}
const zUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
