import { env, waitUntil } from 'cloudflare:workers';
import { database } from '@/lib/hotel-db';
import { authError, checkOrigin, configuration } from '@/lib/hotel-auth';
import { completeRecovery, prepareRecovery, recoveryAttempt, recoveryMessage } from '@/modules/access/recovery';
import { recoverySender } from '@/modules/access/recovery-mail';

async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Error('RECOVERY_BODY');
  const reader = request.body?.getReader();
  if (!reader) throw Error('RECOVERY_BODY');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); throw Error('RECOVERY_BODY'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('RECOVERY_BODY');
  return body as Record<string, unknown>;
}
function failure(error: unknown) {
  if (error instanceof Error && error.message.includes('RECOVERY_RATE_LIMIT')) return authError(429, 'Se alcanzó el límite de solicitudes. Esperá 15 minutos.', { 'Retry-After': '900' });
  if (error instanceof SyntaxError || error instanceof Error && error.message === 'RECOVERY_BODY') return authError(400, 'Solicitud inválida.');
  return authError(503, 'La recuperación no está disponible. Consultá al administrador.');
}

export async function requestRecovery(request: Request) {
  const rejected = checkOrigin(request); if (rejected) return rejected;
  try {
    const body = await readBody(request);
    if (typeof body.email !== 'string' || body.email.length > 240 || !/^\S+@\S+\.\S+$/.test(body.email.trim())) return authError(400, 'Ingresá un email válido.');
    const sender = recoverySender(env);
    if (!sender) return authError(503, 'El envío de correo todavía no está configurado. Consultá al administrador para recuperar el acceso.');
    const db = database(), timestamp = Math.floor(Date.now() / 1000), email = body.email.trim().toLowerCase();
    await recoveryAttempt(db, 'request', email, timestamp);
    // Mail delivery runs outside the response: its latency cannot reveal users.
    const delay = new Promise(resolve => setTimeout(resolve, 2000));
    waitUntil((async () => {
      let tokenHash: string | undefined;
      let phase = 'prepare';
      try {
        const prepared = await prepareRecovery(db, email, configuration().origin, timestamp);
        if (prepared) { tokenHash = prepared.tokenHash; phase = 'delivery'; await sender(prepared.mail); }
      } catch (error) {
        if (tokenHash) { try { await db.prepare('DELETE FROM password_resets WHERE token_hash=?').bind(tokenHash).run(); } catch { /* Token still expires. */ } }
        console.error('RECOVERY_MAIL_DELIVERY_FAILED', phase, error instanceof Error ? error.name : 'Error');
      }
    })());
    await delay;
    return Response.json({ message: recoveryMessage }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function confirmRecovery(request: Request) {
  const rejected = checkOrigin(request); if (rejected) return rejected;
  try {
    const body = await readBody(request);
    if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) return authError(400, 'Enlace inválido o contraseña fuera del rango de 12 a 256 caracteres.');
    const db = database(), timestamp = Math.floor(Date.now() / 1000);
    await recoveryAttempt(db, 'confirm', body.token, timestamp);
    if (!await completeRecovery(db, body.token, body.password, timestamp)) return authError(400, 'El enlace venció, ya se utilizó o el acceso cambió. Solicitá uno nuevo.');
    return Response.json({ message: 'Contraseña actualizada. Ingresá con tu nueva contraseña.' }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': `hotel_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${configuration().secure ? '; Secure' : ''}` } });
  } catch (error) { return failure(error); }
}
