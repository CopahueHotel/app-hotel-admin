import type { Rate } from '@/lib/hotel-types';
import { rateSchema } from '@/modules/tariffs/domain';
export async function planRate(db:D1Database,d:typeof rateSchema._output,add:(sql:string,...v:unknown[])=>void){


  if(d.end<d.start)throw Error('La vigencia hasta debe ser igual o posterior a desde.');
  if(d.id){
   const old=await db.prepare('SELECT * FROM room_rates WHERE id=?').bind(d.id).first<Rate>();
   if(!old)throw Error('Tarifa inexistente.');
   add('UPDATE room_rates SET type=?,regime=?,start=?,end=?,amount=?,responsible=?,note=?,version=? WHERE id=?',d.type,d.regime,d.start,d.end,Math.round(d.amount*100),d.responsible,d.note,d.version+1,d.id);
   return {before:old};
  }
  add('INSERT INTO room_rates (id,type,regime,start,end,amount,responsible,note) VALUES (?,?,?,?,?,?,?,?)',crypto.randomUUID(),d.type,d.regime,d.start,d.end,Math.round(d.amount*100),d.responsible,d.note);
  return {};

}
