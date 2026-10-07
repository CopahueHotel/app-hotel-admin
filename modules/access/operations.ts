import { hashPassword } from '@/modules/access/passwords';
import { permissionCatalog,roleNames,type Identity } from '@/modules/access/permissions';
import { z } from 'zod';
const text=z.string().trim().min(1).max(240),role=z.enum(Object.keys(roleNames) as [keyof typeof roleNames,...(keyof typeof roleNames)[]]);
export const userOperations=z.discriminatedUnion('action',[
 z.object({action:z.literal('userSave'),data:z.object({id:z.string().default(''),version:z.number().int().nonnegative().default(0),name:text,email:z.string().trim().email().max(240).transform(v=>v.toLowerCase()),active:z.boolean(),roles:z.array(role).min(1).max(8).refine(v=>new Set(v).size===v.length),password:z.string().max(256).default('')})}),
 z.object({action:z.literal('userReset'),data:z.object({id:text,version:z.number().int().nonnegative(),password:z.string().min(12).max(256)})}),
 z.object({action:z.literal('rolePermissions'),data:z.object({id:role,version:z.number().int().nonnegative(),permissions:z.array(z.string().refine(p=>permissionCatalog.includes(p))).max(permissionCatalog.length).refine(v=>new Set(v).size===v.length)})}),
]);
type Add=(sql:string,...values:unknown[])=>void;
type User={id:string;name:string;email:string;active:number;roles:string;password_hash:string;version:number};
const safeUser=(u:User)=>({id:u.id,name:u.name,email:u.email,active:u.active,roles:u.roles,version:u.version});
export async function planUsers(db:D1Database,action:string,input:unknown,add:Add,identity:Identity){
 if(!userOperations.options.some(s=>s.shape.action.value===action))return null;
 if(!identity.roles.includes('superadmin'))throw Error('HOT_FORBIDDEN');
 const op=userOperations.parse({action,data:input}),d=op.data;
 if(op.action==='rolePermissions'){
  if(op.data.id==='superadmin'||op.data.permissions.some(p=>p.startsWith('users.')))throw Error('HOT_SUPERADMIN_FIXED');
  const before=await db.prepare('SELECT * FROM roles WHERE id=?').bind(d.id).first<{version:number}>();
  if(!before||before.version!==d.version)throw Error('HOT_VERSION');
  add('UPDATE roles SET permissions=?,version=? WHERE id=?',JSON.stringify(op.data.permissions),d.version+1,d.id);
  return {before,after:{id:d.id,permissions:op.data.permissions}};
 }
 const before=d.id?await db.prepare('SELECT * FROM users WHERE id=?').bind(d.id).first<User>():null;
 if(d.id&&(!before||before.version!==d.version))throw Error('HOT_VERSION');
 if(op.action==='userReset'){
  add('UPDATE users SET password_hash=?,version=? WHERE id=?',await hashPassword(op.data.password),d.version+1,d.id);
  return {before:before?safeUser(before):null,after:{id:d.id,accessReset:true}};
 }
 const data=op.data;
 if(before&&data.password)throw Error('Usá Restablecer acceso para cambiar la contraseña.');
 if(before)add('UPDATE users SET name=?,email=?,active=?,roles=?,version=? WHERE id=?',data.name,data.email,Number(data.active),JSON.stringify(data.roles),data.version+1,data.id);
 else add('INSERT INTO users (id,name,email,active,roles,password_hash,version) VALUES (?,?,?,?,?,?,0)',crypto.randomUUID(),data.name,data.email,Number(data.active),JSON.stringify(data.roles),await hashPassword(data.password));
 return {before:before?safeUser(before):null,after:{id:data.id,name:data.name,email:data.email,active:data.active,roles:data.roles}};
}
