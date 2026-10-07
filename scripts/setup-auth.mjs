import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.argv[2] || 'http://localhost:5173';
const url = new URL(origin);
if (origin !== url.origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
  throw Error('Usá una URL HTTPS sin ruta; HTTP se permite únicamente en localhost.');
}
const target = fileURLToPath(new URL('../.dev.vars', import.meta.url));
if (existsSync(target)) throw Error('.dev.vars ya existe. Conservá ese archivo; para regenerar el acceso, respaldalo fuera del repositorio y renombralo primero.');
writeFileSync(target, `AUTH_ORIGIN=${origin}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Origen configurado para ${origin}.\nCreá el primer superadministrador con npm run auth:bootstrap -- "Nombre" email@dominio.com.\nReiniciá el servidor para tomar la configuración.`);
