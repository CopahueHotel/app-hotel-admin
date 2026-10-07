import type { HotelTables } from '@/lib/hotel-types';
export type Add=(sql:string,...values:unknown[])=>void;
export function operationContext(db:D1Database,add:Add,actor:string){
 const id=()=>crypto.randomUUID(),cents=(n:number)=>Math.round(n*100);
 const row=async<T extends keyof HotelTables>(t:T,key:keyof HotelTables[T],val:unknown)=>db.prepare(`SELECT * FROM ${t} WHERE ${String(key)}=?`).bind(val).first<HotelTables[T]>();
 const cash=(date:string,acc:string,amount:number,ar:string,kind:string,ref:string,label:string)=>add('INSERT INTO cash_movements VALUES (?,?,?,?,?,?,?,?)',id(),date,acc,amount,ar,kind,ref,label);
 return {db,add,actor,row,cash,id,cents};
}
export type OperationContext=ReturnType<typeof operationContext>;
