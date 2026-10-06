import './sites-env.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vars = fileURLToPath(new URL('../.dev.vars', import.meta.url));
if (!existsSync(vars)) throw Error('Configurá el acceso primero con npm run auth:setup -- https://TU-DOMINIO.');
const cli = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url);
// Wrangler's CommonJS launcher only runs when executed as the main module.
const child = spawn(process.execPath, [fileURLToPath(cli), 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--port', '8787', '--inspector-port', '0', '--env-file', vars], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1); });
