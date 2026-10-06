import './sites-env.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vars = fileURLToPath(new URL('../.dev.vars', import.meta.url));
if (!existsSync(vars)) throw Error('Configurá el acceso primero con npm run auth:setup -- https://TU-DOMINIO.');
const cli = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--port', '8787', '--inspector-port', '0', '--env-file', vars];
await import(cli.href);
