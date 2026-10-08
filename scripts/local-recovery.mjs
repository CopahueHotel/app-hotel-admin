import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const [emailInput, originInput = 'http://localhost:5173'] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase(), origin = new URL(originInput);
if (!email || !/^\S+@\S+\.\S+$/.test(email) || origin.origin !== originInput || origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw Error('Uso local: npm run auth:recovery-link -- email@dominio.com http://localhost:5173');
const root = path.resolve('.wrangler/state/v3/d1');
const files = readdirSync(root, { recursive: true }).filter(f => String(f).endsWith('.sqlite') && path.basename(String(f)) !== 'metadata.sqlite');
if (files.length !== 1) throw Error('Se necesita una única base local migrada. Detené la app y ejecutá db:local primero.');
const db = new DatabaseSync(path.join(root, String(files[0])));
try {
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  const user = db.prepare('SELECT id,email,version FROM users WHERE email=? AND active=1').get(email);
  if (!user) throw Error('No existe una cuenta activa con ese email en la base local.');
  const token = randomBytes(32).toString('hex'), timestamp = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM password_resets WHERE expires<=?').run(timestamp);
  db.prepare('INSERT INTO password_resets (token_hash,user_id,user_version,expires) VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('hex'), user.id, user.version, timestamp + 900);
  // Local maintenance has no authenticated web session. Do not invent an actor.
  db.prepare('INSERT INTO audit_log (id,created,actor,actor_id,action,detail) VALUES (?,?,?,NULL,?,?)').run(randomUUID(), new Date().toISOString(), 'Consola local', 'recoveryLinkLocal', JSON.stringify({ method: 'Mantenimiento local', email: user.email }));
  db.exec('COMMIT');
  console.log(`Enlace privado local (vence en 15 minutos; no lo compartas):\n${originInput}/recuperar#${token}\nIniciá nuevamente la app y abrí el enlace. La contraseña todavía no cambió.`);
} catch (error) { db.exec('ROLLBACK'); throw error; }
finally { db.close(); }
