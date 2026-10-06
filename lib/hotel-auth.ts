import { env } from 'cloudflare:workers';
import { database } from '@/lib/hotel-db';

const cookieName = 'hotel_session';
const lifetime = 8 * 60 * 60;
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], b => parseInt(b, 16));
const now = () => Math.floor(Date.now() / 1000);

function configuration() {
  const hash = env.AUTH_PASSWORD_HASH;
  const origin = env.AUTH_ORIGIN;
  if (!hash || !/^pbkdf2-sha256:100000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash) || !origin) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }
  return { hash, origin, secure: url.protocol === 'https:' };
}

async function digest(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

async function passwordMatches(password: string, stored: string) {
  const [, iterations, salt, expected] = stored.split(':');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: Number(iterations) }, key, 256));
  const wanted = unhex(expected);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ wanted[i];
  return difference === 0;
}

function sessionToken(request: Request) {
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(c => c.trim());
  const matches = cookies.filter(c => c.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function cookie(token: string, secure: boolean, maxAge = lifetime) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function authError(status: number, error: string, extraHeaders: Record<string, string> = {}) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}

export function loginLocation() {
  try { return `${configuration().origin}/login`; }
  catch { return '/login'; }
}

export function checkOrigin(request: Request): Response | null {
  try {
    return request.headers.get('origin') === configuration().origin ? null : authError(403, 'Origen no permitido.');
  } catch {
    return authError(503, 'El acceso todavía no está configurado.');
  }
}

export async function requireSession(request: Request): Promise<Response | null> {
  try {
    const config = configuration();
    const token = sessionToken(request);
    if (!token) return authError(401, 'Ingresá para acceder al hotel.');
    const session = await database().prepare('SELECT expires,password_version FROM auth_sessions WHERE token_hash=?')
      .bind(await digest(token)).first<{ expires: number; password_version: string }>();
    if (!session || session.expires <= now() || session.password_version !== await digest(config.hash)) {
      return authError(401, 'La sesión venció. Volvé a ingresar.');
    }
    return null;
  } catch {
    return authError(503, 'El acceso no está disponible. Revisá la configuración y las migraciones locales.');
  }
}

export async function login(request: Request): Promise<Response> {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return authError(400, 'Solicitud inválida.');
    // Bound the body before parsing or deriving the password hash.
    const reader = request.body?.getReader();
    if (!reader) return authError(400, 'Ingresá la contraseña.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return authError(413, 'Solicitud demasiado grande.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { password?: unknown };
    if (typeof body?.password !== 'string' || !body.password.length || body.password.length > 256) return authError(400, 'Ingresá la contraseña.');
    const db = database();
    const timestamp = now();
    try {
      // The trigger makes the global 20 attempts / 15 minutes limit durable and atomic.
      await db.batch([
        db.prepare('DELETE FROM auth_attempts WHERE created<=?').bind(timestamp - 900),
        db.prepare('INSERT INTO auth_attempts (id,created) VALUES (?,?)').bind(crypto.randomUUID(), timestamp),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('AUTH_RATE_LIMIT')) {
        return authError(429, 'Se alcanzó el límite de intentos. Esperá 15 minutos para volver a probar.', { 'Retry-After': '900' });
      }
      throw error;
    }
    const config = configuration();
    if (!await passwordMatches(body.password, config.hash)) return authError(401, 'Contraseña incorrecta.');
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.batch([
      db.prepare('DELETE FROM auth_sessions WHERE expires<=?').bind(timestamp),
      db.prepare('INSERT INTO auth_sessions (token_hash,password_version,expires) VALUES (?,?,?)').bind(await digest(token), await digest(config.hash), timestamp + lifetime),
    ]);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie(token, config.secure) } });
  } catch (error) {
    if (error instanceof SyntaxError) return authError(400, 'Solicitud inválida.');
    return authError(503, 'El acceso no está disponible. Revisá la configuración y las migraciones locales.');
  }
}

export async function logout(request: Request): Promise<Response> {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    const config = configuration();
    const token = sessionToken(request);
    if (token) await database().prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest(token)).run();
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie('', config.secure, 0) } });
  } catch {
    return authError(503, 'No se pudo cerrar la sesión. Intentá nuevamente.');
  }
}
