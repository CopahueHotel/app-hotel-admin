import { database } from '@/lib/hotel-db';
import { digest,passwordMatches } from '@/modules/access/passwords';
import { permissionCatalog,type Identity } from '@/modules/access/permissions';
import { env } from 'cloudflare:workers';

const cookieName = 'hotel_session';
const lifetime = 8 * 60 * 60;
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const now = () => Math.floor(Date.now() / 1000);

export function configuration() {
  const origin = env.AUTH_ORIGIN;
  if (!origin) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }
  return { origin, secure: url.protocol === 'https:' };
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

export async function sessionIdentity(request:Request):Promise<Identity|Response>{
 try{
  configuration();
  const token=sessionToken(request);
  if(!token)return authError(401,'Ingresá para acceder al hotel.');
  const sessionHash=await digest(token),db=database();
  const results=await db.batch([
   db.prepare('SELECT u.id,u.name,u.email,u.roles,u.password_hash,s.password_version FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').bind(sessionHash,now()),
   db.prepare('SELECT id,permissions FROM roles'),
   db.prepare('SELECT revision FROM access_state WHERE id=1'),
  ]);
  const user=results[0].results[0] as {id:string;name:string;email:string;roles:string;password_hash:string;password_version:string}|undefined;
  if(!user||user.password_version!==await digest(user.password_hash))return authError(401,'La sesión venció. Volvé a ingresar.');
  const assigned=JSON.parse(user.roles) as string[];
  const roleRows=results[1].results as {id:string;permissions:string}[];
  const permissions=assigned.includes('superadmin')?permissionCatalog:[...new Set(roleRows.filter(r=>assigned.includes(r.id)).flatMap(r=>JSON.parse(r.permissions) as string[]))];
  return {id:user.id,name:user.name,email:user.email,roles:assigned,permissions,revision:Number((results[2].results[0] as {revision:number}).revision),sessionHash};
 }catch{return authError(503,'El acceso no está disponible. Revisá la configuración y las migraciones locales.');}
}
export async function requireSession(request:Request):Promise<Response|null>{
 const identity=await sessionIdentity(request);return identity instanceof Response?identity:null;
}
export function accessGuard(db:D1Database,identity:Identity){
 const id=crypto.randomUUID();
 return {start:db.prepare('INSERT INTO access_checks (id,user_id,session_hash,revision) VALUES (?,?,?,?)').bind(id,identity.id,identity.sessionHash,identity.revision),end:db.prepare('DELETE FROM access_checks WHERE id=?').bind(id)};
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
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown; password?: unknown };
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
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const user=await db.prepare('SELECT id,password_hash,active FROM users WHERE email=?').bind(email).first<{id:string;password_hash:string;active:number}>();
    if(!user||!user.active||!await passwordMatches(body.password,user.password_hash))return authError(401,'Email o contraseña incorrectos.');
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const inserted=await db.batch([
      db.prepare('DELETE FROM auth_sessions WHERE expires<=?').bind(timestamp),
      db.prepare('INSERT INTO auth_sessions (token_hash,password_version,expires,user_id) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=? AND active=1 AND password_hash=?)').bind(await digest(token), await digest(user.password_hash), timestamp + lifetime,user.id,user.id,user.password_hash),
    ]);
    if(inserted[1].meta.changes!==1)return authError(401,'El acceso cambió. Volvé a ingresar.');
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
