import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.argv[2] || 'http://localhost:5173';
const url = new URL(origin);
if (origin !== url.origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
  throw Error('Usá una URL HTTPS sin ruta; HTTP se permite únicamente en localhost.');
}
const target = fileURLToPath(new URL('../.dev.vars', import.meta.url));
if (existsSync(target)) throw Error('.dev.vars ya existe. Conservá ese archivo; para regenerar el acceso, respaldalo fuera del repositorio y renombralo primero.');
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
writeFileSync(target, `AUTH_ORIGIN=${origin}\nAUTH_PASSWORD_HASH=pbkdf2-sha256:100000:${salt.toString('hex')}:${hash}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Acceso configurado para ${origin}.\nContraseña: ${password}\nGuardala en tu gestor de contraseñas: no se almacena en texto plano.\nReiniciá el servidor para tomar la configuración.`);
