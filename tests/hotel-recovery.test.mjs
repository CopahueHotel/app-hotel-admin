import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, testPassword } from './helpers/hotel-fixture.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const timestamp = () => Math.floor(Date.now() / 1000);
async function link(f, email = 'admin@example.test', at = timestamp()) {
  const core = f.load('modules/access/recovery.ts');
  const prepared = await core.prepareRecovery(f.raw, email, 'http://localhost', at);
  return prepared ? { ...prepared, token: prepared.mail.text.match(/recuperar#([a-f0-9]{64})/)[1] } : null;
}

test('recovery stores only a hash, changes the password once and revokes all sessions/links atomically', async t => {
  const f = await fixture(t), core = f.load('modules/access/recovery.ts'), first = await link(f), second = await link(f);
  assert.ok(!JSON.stringify(await f.raw.prepare('SELECT * FROM password_resets').all()).includes(first.token));
  const old = await f.one("SELECT * FROM users WHERE id='test-admin'");
  assert.equal(await core.completeRecovery(f.raw, first.token, 'new-private-password', timestamp()), true);
  const current = await f.one("SELECT * FROM users WHERE id='test-admin'");
  assert.equal(current.version, old.version + 1); assert.equal(current.roles, old.roles);
  assert.equal(await f.count('auth_sessions'), 0); assert.equal(await f.count('password_resets'), 0);
  assert.equal(await core.completeRecovery(f.raw, first.token, 'different-private-password', timestamp()), false);
  assert.equal(await core.completeRecovery(f.raw, second.token, 'different-private-password', timestamp()), false);
  assert.equal((await f.auth.sessionIdentity(new Request('http://localhost', { headers: { Cookie: f.cookie } }))).status, 401);
  assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }))).status, 401);
  assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: 'new-private-password' }))).status, 200);
  const audit = await f.one("SELECT * FROM audit_log WHERE action='passwordRecovery'");
  assert.equal(audit.actor_id, 'test-admin');
  assert.ok(!audit.detail.includes(first.token)); assert.ok(!audit.detail.includes('password_hash')); assert.ok(!audit.detail.includes('new-private-password'));
});

test('expired, missing, inactive and modified accounts cannot use recovery links', async t => {
  const f = await fixture(t), core = f.load('modules/access/recovery.ts');
  assert.equal(await link(f, 'missing@example.test'), null);
  const expired = await link(f, 'admin@example.test', timestamp() - 901);
  assert.equal(await core.completeRecovery(f.raw, expired.token, 'new-private-password', timestamp()), false);
  const valid = await link(f);
  await f.raw.prepare("UPDATE users SET email='changed@example.test',version=version+1 WHERE id='test-admin'").run();
  assert.equal(await core.completeRecovery(f.raw, valid.token, 'new-private-password', timestamp()), false);
  await f.raw.prepare("INSERT INTO users (id,name,email,active,roles,password_hash,version) SELECT 'inactive','Inactive','inactive@example.test',0,'[\"manager\"]',password_hash,0 FROM users WHERE id='test-admin'").run();
  assert.equal(await link(f, 'inactive@example.test'), null);
});

test('concurrent confirmations have exactly one winner and one history entry', async t => {
  const f = await fixture(t), core = f.load('modules/access/recovery.ts'), prepared = await link(f);
  const results = await Promise.all(['first-private-password', 'second-private-password'].map(password => core.completeRecovery(f.raw, prepared.token, password, timestamp())));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await f.one("SELECT COUNT(*) n FROM audit_log WHERE action='passwordRecovery'")).n, 1);
});

test('server rejects foreign origins, oversized requests and bad passwords; disabled mail creates no links', async t => {
  const f = await fixture(t), http = f.load('modules/access/recovery-http.ts');
  assert.equal((await http.requestRecovery(f.authRequest('/api/auth/recovery/request', { email: 'admin@example.test' }, { Origin: 'https://foreign.example' }))).status, 403);
  assert.equal((await http.requestRecovery(f.authRequest('/api/auth/recovery/request', { email: 'admin@example.test' }))).status, 503);
  assert.equal(await f.count('password_resets'), 0);
  const prepared = await link(f);
  assert.equal((await http.confirmRecovery(f.authRequest('/api/auth/recovery/confirm', { token: prepared.token, password: 'short' }))).status, 400);
  assert.equal((await http.confirmRecovery(f.authRequest('/api/auth/recovery/confirm', { token: prepared.token, password: 'a'.repeat(3000) }))).status, 400);
  const success = await http.confirmRecovery(f.authRequest('/api/auth/recovery/confirm', { token: prepared.token, password: 'changed-private-password' }));
  assert.equal(success.status, 200); assert.match(success.headers.get('set-cookie'), /Max-Age=0/);
});

test('durable limits reject simultaneous repeated requests and enforce a global ceiling', async t => {
  const f = await fixture(t), core = f.load('modules/access/recovery.ts'), at = timestamp();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => core.recoveryAttempt(f.raw, 'request', 'same@example.test', at)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => String(r.reason).includes('RECOVERY_RATE_LIMIT')));
  for (let i = 0; i < 17; i++) await core.recoveryAttempt(f.raw, 'request', `${i}@example.test`, at);
  await assert.rejects(core.recoveryAttempt(f.raw, 'request', 'last@example.test', at), /RECOVERY_RATE_LIMIT/);
  await core.recoveryAttempt(f.raw, 'request', 'same@example.test', at + 901);
});

test('mail adapter stays disabled without settings and sends only to the registered address', async t => {
  const f = await fixture(t), mail = f.load('modules/access/recovery-mail.ts');
  assert.equal(mail.recoverySender({}), null);
  assert.throws(() => mail.recoverySender({ MAIL_API_URL: 'http://example.test', MAIL_API_KEY: 'test-only', MAIL_FROM: 'hotel@example.test' }));
  const oldFetch = globalThis.fetch, calls = [];
  t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 202 }); };
  f.authEnv.MAIL_API_URL = 'https://mail.example.test/send'; f.authEnv.MAIL_API_KEY = 'test-only'; f.authEnv.MAIL_FROM = 'hotel@example.test';
  const http = f.load('modules/access/recovery-http.ts');
  const known = await http.requestRecovery(f.authRequest('/api/auth/recovery/request', { email: 'ADMIN@example.test' }));
  const missing = await http.requestRecovery(f.authRequest('/api/auth/recovery/request', { email: 'missing@example.test' }));
  assert.equal(known.status, missing.status); assert.deepEqual(await known.json(), await missing.json());
  assert.equal(calls.length, 1); const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload.to, ['admin@example.test']); assert.match(payload.text, /http:\/\/localhost\/recuperar#[a-f0-9]{64}/);
  assert.equal(calls[0].init.redirect, 'error');
});

test('failed mail delivery returns the same generic response, removes its token and never logs secrets', async t => {
  const f = await fixture(t), oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async () => new Response(null, { status: 500 });
  f.authEnv.MAIL_API_URL = 'https://mail.example.test/send'; f.authEnv.MAIL_API_KEY = 'test-only'; f.authEnv.MAIL_FROM = 'hotel@example.test';
  const response = await f.load('modules/access/recovery-http.ts').requestRecovery(f.authRequest('/api/auth/recovery/request', { email: 'admin@example.test' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, f.load('modules/access/recovery.ts').recoveryMessage);
  assert.equal(await f.count('password_resets'), 0);
});

test('private console recovery generates a hashed local link without changing the password or roles', async t => {
  const folder = mkdtempSync(path.join(tmpdir(), 'hotel-recovery-cli-'));
  const local = path.join(folder, '.wrangler/state/v3/d1'); mkdirSync(local, { recursive: true });
  const db = new DatabaseSync(path.join(local, 'test.sqlite'));
  t.after(() => {
    db.close();
    if (path.dirname(path.resolve(folder)) !== path.resolve(tmpdir()) || !path.basename(folder).startsWith('hotel-recovery-cli-')) throw Error('Unexpected cleanup path');
    rmSync(folder, { recursive: true, force: true });
  });
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(path.join('drizzle', file), 'utf8'));
  db.prepare('INSERT INTO users (id,name,email,active,roles,password_hash,version) VALUES (?,?,?,1,?,?,0)').run('cli-admin', 'CLI Admin', 'cli@example.test', '["superadmin"]', 'pbkdf2-sha256:600000:unmodified-test-hash');
  const before = db.prepare("SELECT * FROM users WHERE id='cli-admin'").get();
  const script = path.resolve('scripts/local-recovery.mjs');
  const result = spawnSync(process.execPath, [script, 'cli@example.test', 'http://localhost:5173'], { cwd: folder, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const token = result.stdout.match(/recuperar#([a-f0-9]{64})/)[1];
  const stored = db.prepare('SELECT * FROM password_resets').get(); assert.notEqual(stored.token_hash, token);
  assert.deepEqual(db.prepare("SELECT * FROM users WHERE id='cli-admin'").get(), before);
  const audit = db.prepare("SELECT * FROM audit_log WHERE action='recoveryLinkLocal'").get();
  assert.equal(audit.actor_id, null); assert.ok(!audit.detail.includes(token));
  const remote = spawnSync(process.execPath, [script, 'cli@example.test', 'https://hotel.example.test'], { cwd: folder, encoding: 'utf8', windowsHide: true });
  assert.notEqual(remote.status, 0);
});
