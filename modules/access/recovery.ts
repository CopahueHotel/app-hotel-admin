import { digest, hashPassword } from '@/modules/access/passwords';

export const recoveryMessage = 'Si existe una cuenta activa con ese email, recibirás un enlace para cambiar la contraseña.';
export const recoveryLifetime = 900;
type User = { id: string; name: string; email: string; version: number };
export type RecoveryMail = { to: string; subject: string; text: string };

export async function recoveryAttempt(db: D1Database, kind: 'request' | 'confirm', subject: string, timestamp: number) {
  await db.batch([
    db.prepare('DELETE FROM recovery_attempts WHERE created<=?').bind(timestamp - 900),
    db.prepare('INSERT INTO recovery_attempts (id,kind,subject_hash,created) VALUES (?,?,?,?)').bind(crypto.randomUUID(), kind, await digest(subject), timestamp),
    db.prepare('DELETE FROM password_resets WHERE expires<=?').bind(timestamp),
  ]);
}

// The raw token exists only in memory and in the private email link.
export async function prepareRecovery(db: D1Database, email: string, origin: string, timestamp: number) {
  const user = await db.prepare('SELECT id,name,email,version FROM users WHERE email=? AND active=1').bind(email).first<User>();
  if (!user) return null;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await digest(token);
  const result = await db.prepare('INSERT INTO password_resets (token_hash,user_id,user_version,expires) SELECT ?,id,version,? FROM users WHERE id=? AND active=1 AND version=?').bind(tokenHash, timestamp + recoveryLifetime, user.id, user.version).run();
  if (result.meta.changes !== 1) return null;
  // A fragment prevents the token from reaching proxy/server URL logs.
  const link = `${origin}/recuperar#${token}`;
  return { tokenHash, mail: { to: user.email, subject: 'Hotel Copahue · Recuperar acceso', text: `Se solicitó cambiar la contraseña de tu cuenta del hotel.\n\nAbrí este enlace en los próximos 15 minutos:\n${link}\n\nSe puede utilizar una sola vez. Si no lo solicitaste, ignorá este mensaje: tu contraseña no cambió.` } satisfies RecoveryMail };
}

export async function completeRecovery(db: D1Database, token: string, password: string, timestamp: number) {
  const tokenHash = await digest(token);
  const user = await db.prepare('SELECT u.id,u.name,u.email,u.version FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.expires>? AND u.active=1 AND u.version=r.user_version').bind(tokenHash, timestamp).first<User>();
  if (!user) return false;
  const passwordHash = await hashPassword(password);
  // One atomic batch: the user trigger revokes sessions and deletes every link.
  // Concurrent confirmations cannot both update the password or create an audit.
  const result = await db.batch([
    db.prepare('UPDATE users SET password_hash=?,version=version+1 WHERE id=? AND active=1 AND version=? AND EXISTS (SELECT 1 FROM password_resets WHERE token_hash=? AND user_id=users.id AND user_version=users.version AND expires>max(?,unixepoch())) RETURNING id').bind(passwordHash, user.id, user.version, tokenHash, timestamp),
    db.prepare('INSERT INTO audit_log (id,created,actor,actor_id,action,detail) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(), new Date(timestamp * 1000).toISOString(), user.name, user.id, 'passwordRecovery', JSON.stringify({ method: 'Enlace de recuperación', email: user.email, accessReset: true })),
  ]);
  return result[0].results.length === 1;
}
