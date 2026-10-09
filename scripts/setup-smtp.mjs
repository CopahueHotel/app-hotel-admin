import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';

const [host, port, user, recipients = ''] = process.argv.slice(2);
const email = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
if (!host || !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) || port !== '465' || !email.test(user ?? '') || recipients.split(',').filter(Boolean).some(value => !email.test(value.trim()))) throw Error('Uso: npm run auth:smtp -- servidor 465 remitente@dominio.com [emails-de-prueba-separados-por-coma]');
if (!process.stdin.isTTY || !process.stdin.setRawMode) throw Error('Ejecutar desde una consola interactiva. No pasar contraseñas como argumentos o por tuberías.');
const filename = path.resolve('.dev.vars');
const previous = readFileSync(filename, 'utf8');
if (!/^AUTH_ORIGIN=/m.test(previous)) throw Error('Falta AUTH_ORIGIN en .dev.vars.');
if (/^APP_ENV=["']?test["']?\s*$/m.test(previous) && !recipients) throw Error('Pruebas requiere indicar los emails autorizados como cuarto argumento.');

function hidden(prompt) {
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setEncoding('utf8'); process.stdin.setRawMode(true); process.stdin.resume();
    function finish(error) {
      process.stdin.off('data', input); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    }
    function input(chunk) {
      for (const character of chunk) {
        if (character === '\u0003') { finish(Error('Cancelado.')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (character >= ' ') value += character;
        if (value.length > 1024) { finish(Error('Contraseña demasiado larga.')); return; }
      }
    }
    process.stdin.on('data', input);
  });
}
const password = await hidden('Contraseña SMTP (no se muestra): ');
if (!password || password !== await hidden('Repetir contraseña SMTP: ')) throw Error('Las contraseñas no coinciden o están vacías. No se cambió la configuración.');
const values = { MAIL_PROVIDER: 'smtp', SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASSWORD: password, MAIL_FROM: user, ...(recipients ? { MAIL_TEST_RECIPIENTS: recipients.split(',').map(value => value.trim().toLowerCase()).join(',') } : {}) };
let output = previous;
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  output = pattern.test(output) ? output.replace(pattern, () => line) : output.replace(/\s*$/, '') + '\n' + line + '\n';
}
writeFileSync(filename, output); chmodSync(filename, 0o600);
console.log('SMTP configurado en .dev.vars privado. Reiniciar este entorno y probar la recuperación. No se enviaron correos ni se cambió la contraseña de ninguna cuenta de la app.');
