import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const [name,emailInput]=process.argv.slice(2),email=emailInput?.trim().toLowerCase();
if(!name?.trim()||name.length>240||!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Uso: npm run auth:bootstrap -- "Nombre completo" email@dominio.com');
// Explicit local maintenance only. Stop the app and apply db:local first.
const root=path.resolve('.wrangler/state/v3/d1');
const files=readdirSync(root,{recursive:true}).filter(f=>String(f).endsWith('.sqlite')&&path.basename(String(f))!=='metadata.sqlite');
if(files.length!==1)throw Error('Se necesita una única base local migrada. Ejecutá npm run db:local y detené el servidor.');
const db=new DatabaseSync(path.join(root,String(files[0])));
try{
 db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
 if(db.prepare('SELECT COUNT(*) n FROM users').get().n!==0)throw Error('Ya existen usuarios. El primer administrador se crea una sola vez; usá Usuarios y permisos para nuevas cuentas.');
 const password=randomBytes(24).toString('base64url'),salt=randomBytes(16),hash='pbkdf2-sha256:600000:'+salt.toString('hex')+':'+pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex'),id=randomUUID();
 db.prepare('INSERT INTO users (id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?, ?,0)').run(id,name.trim(),email,'["superadmin"]',hash);
 db.prepare('INSERT INTO audit_log (id,created,actor,actor_id,action,detail) VALUES (?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),name.trim(),id,'bootstrapAdmin',JSON.stringify({method:'Consola local',email,roles:['superadmin']}));
 db.exec('COMMIT');
 console.log('Superadministrador creado: '+email+'\nContraseña generada (se muestra una sola vez): '+password+'\nGuardala en tu gestor y entregala de forma privada. No se guardó en texto plano.');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
