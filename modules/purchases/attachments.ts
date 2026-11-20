import { z } from 'zod';
import type { Add } from '@/modules/shared/operations';
export const attachmentLimit=1024*1024;
export const attachmentSchema=z.object({name:z.string().trim().min(1).max(180),mime:z.enum(['application/pdf','image/jpeg','image/png','image/webp']),content:z.string().min(4).max(Math.ceil(attachmentLimit/3)*4)});
export const attachmentFiles=z.array(attachmentSchema).max(5).default([]);
export type AttachmentInput=z.infer<typeof attachmentSchema>;
export function attachmentBytes(file:AttachmentInput){
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(file.content)||file.content.length%4)throw Error('HOT_ATTACHMENT_INVALID');
 let bytes:Uint8Array<ArrayBuffer>;try{bytes=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0));}catch{throw Error('HOT_ATTACHMENT_INVALID');}
 if(!bytes.length||bytes.length>attachmentLimit)throw Error('HOT_ATTACHMENT_INVALID');
 const starts=(values:number[])=>values.every((v,i)=>bytes[i]===v);
 const valid=file.mime==='application/pdf'?starts([37,80,68,70,45]):file.mime==='image/jpeg'?starts([255,216,255])&&bytes.at(-2)===255&&bytes.at(-1)===217:file.mime==='image/png'?starts([137,80,78,71,13,10,26,10]):starts([82,73,70,70])&&[87,69,66,80].every((v,i)=>bytes[i+8]===v);
 if(!valid)throw Error('HOT_ATTACHMENT_INVALID');
 return bytes;
}
export async function appendAttachments(add:Add,expense:string,files:AttachmentInput[],actor:{id:string;name:string},cash:string|null=null){
 const metadata=[];
 for(const file of files){const bytes=attachmentBytes(file),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),created=new Date().toISOString();
  const extension={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[file.mime];
  const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,160).replace(/\.[^.]+$/,'')+extension;
  add('INSERT INTO purchase_attachments VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,expense,cash,name,file.mime,bytes.length,digest,file.content,created,actor.name,actor.id);
  metadata.push({id,name,mime:file.mime,size:bytes.length,digest,created,cash});
 }
 return metadata;
}
// Bound JSON before parsing, including chunked requests containing file data.
export async function readHotelJson(request:Request){
 const reader=request.body?.getReader();if(!reader)throw Error('Falta el contenido de la operación.');
 const limit=8*1024*1024,chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw Error('Los archivos superan el límite de la solicitud. Adjuntá hasta cinco archivos de 1 MB.');}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
