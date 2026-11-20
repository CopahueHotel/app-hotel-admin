'use client';
import type { HotelData } from '@/lib/hotel-types';
import { attachmentLimit,type AttachmentInput } from '@/modules/purchases/attachments';
export async function encodePurchaseFiles(files:File[]):Promise<AttachmentInput[]>{
 if(files.length>5)throw Error('Podés adjuntar hasta cinco archivos por vez.');
 return Promise.all(files.map(async file=>{
  if(!file.size||file.size>attachmentLimit)throw Error(`${file.name}: el archivo debe pesar hasta 1 MB.`);
  const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const mime=file.type as AttachmentInput['mime'];
  if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime))throw Error('Usá PDF, JPG, PNG o WebP.');
  return {name:file.name,mime,content:btoa(text)};
 }));
}
export function AttachmentFields({onChange,required=false}:{onChange:(files:File[])=>void;required?:boolean}){
 return <label className="field purchase-attachment-field"><span>Subir comprobante{!required&&' (opcional)'}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple required={required} onChange={e=>onChange(Array.from(e.target.files??[]))}/><small>PDF, JPG, PNG o WebP · hasta 1 MB por archivo y cinco por carga. Se guardan de forma privada; adjuntar no registra un pago.</small></label>;
}
export function AttachmentList({data,expense}:{data:HotelData;expense:string}){
 const files=(data.purchase_attachments??[]).filter(a=>a.expense===expense);
 return <div className="purchase-attachment-list">{files.length?<ul>{files.map(file=><li key={file.id}><a href={'/api/hotel/purchase-attachment?id='+encodeURIComponent(file.id)} download>{file.name}</a><small>{file.cash?'Comprobante de pago':'Comprobante del gasto'} · {Math.ceil(file.size/1024)} KB · {file.actor} · {new Date(file.created).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}</small></li>)}</ul>:<p className="muted">Sin archivos adjuntos.</p>}</div>;
}
