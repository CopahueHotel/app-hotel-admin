import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, testPassword } from './helpers/hotel-fixture.mjs';

test('anonymous and forged sessions cannot read or mutate hotel data', async t => {
  const f = await fixture(t);
  const before = await f.count('audit_log');
  for (const headers of [{}, { Cookie: 'hotel_session=' + 'a'.repeat(64), 'oai-authenticated-user-email': 'admin@example.test' }]) {
    const r = await f.api.GET(new Request('http://localhost/api/hotel', { headers }));
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await r.json()).bookings, undefined);
    assert.equal((await f.api.POST(f.authRequest('/api/hotel', { action: 'settings', data: { mealPrice: 9 } }, headers))).status, 401);
  }
  assert.equal(await f.count('audit_log'), before);
  const middleware = f.load('proxy.ts').proxy;
  const screen = await middleware(new Request('http://localhost/'));
  assert.equal(screen.status, 303);
  assert.equal(screen.headers.get('location'), 'http://localhost/login');
  assert.equal((await middleware(new Request('http://localhost/api/hotel'))).status, 401);
  assert.equal((await middleware(new Request('http://localhost/', { headers: { Cookie: f.cookie } }))).headers.get('x-middleware-next'), '1');
});

test('login rejects wrong passwords, foreign origins and oversized input', async t => {
  const f = await fixture(t);
  const wrong = await f.auth.login(f.authRequest('/api/auth/login', { password: 'wrong' }));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }, { Origin: 'https://foreign.example' }))).status, 403);
  assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }, { Origin: '' }))).status, 403);
  assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: 'x'.repeat(3000) }))).status, 413);
  assert.equal((await f.auth.login(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal(await f.count('auth_sessions'), 1);
});

test('sessions are hashed, expire, revoke on logout and invalidate after password rotation', async t => {
  const f = await fixture(t);
  const result = await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }));
  assert.equal(result.status, 200);
  const header = result.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Max-Age=28800/);
  const cookie = header.split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  assert.equal(await f.one('SELECT * FROM auth_sessions WHERE token_hash=?', token), null);
  const request = new Request('http://localhost/api/hotel', { headers: { Cookie: cookie } });
  assert.equal(await f.auth.requireSession(request), null);
  const rejected = await f.auth.logout(f.authRequest('/api/auth/logout', {}, { Cookie: cookie, Origin: 'https://foreign.example' }));
  assert.equal(rejected.status, 403);
  assert.equal(await f.auth.requireSession(request), null);
  const out = await f.auth.logout(f.authRequest('/api/auth/logout', {}, { Cookie: cookie }));
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.auth.requireSession(request)).status, 401);
  await f.raw.prepare('UPDATE auth_sessions SET expires=0').run();
  assert.equal((await f.auth.requireSession(new Request('http://localhost', { headers: { Cookie: f.cookie } }))).status, 401);
  const fresh = await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }));
  const freshCookie = fresh.headers.get('set-cookie').split(';')[0];
  f.authEnv.AUTH_PASSWORD_HASH = f.authEnv.AUTH_PASSWORD_HASH.slice(0, -1) + (f.authEnv.AUTH_PASSWORD_HASH.endsWith('0') ? '1' : '0');
  assert.equal((await f.auth.requireSession(new Request('http://localhost', { headers: { Cookie: freshCookie } }))).status, 401);
});

test('HTTPS origin creates secure cookies and remains valid behind a reverse proxy', async t => {
  const f = await fixture(t);
  f.authEnv.AUTH_ORIGIN = 'https://test.hotel.example';
  const result = await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }));
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /; Secure/);
  const cookie = result.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, Origin: f.authEnv.AUTH_ORIGIN, 'Idempotency-Key': crypto.randomUUID(), 'oai-authenticated-user-email': 'spoofed@example.test' };
  const response = await f.api.POST(f.authRequest('/api/hotel', { action: 'settings', data: { mealPrice: 100 } }, headers));
  assert.equal(response.status, 200);
  assert.equal((await f.one('SELECT actor FROM audit_log')).actor, 'Acceso compartido de prueba');
  assert.equal((await f.api.POST(f.authRequest('/api/hotel', { action: 'settings', data: { mealPrice: 100 } }, { ...headers, Origin: 'http://localhost' }))).status, 403);
});

test('missing or unsafe configuration fails closed', async t => {
  const f = await fixture(t);
  const hash = f.authEnv.AUTH_PASSWORD_HASH;
  for (const invalid of [undefined, 'plaintext']) {
    f.authEnv.AUTH_PASSWORD_HASH = invalid;
    assert.equal((await f.api.GET(new Request('http://localhost/api/hotel', { headers: { Cookie: f.cookie } }))).status, 503);
    assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }))).status, 503);
  }
  f.authEnv.AUTH_PASSWORD_HASH = hash;
  f.authEnv.AUTH_ORIGIN = 'http://public.hotel.example';
  assert.equal((await f.auth.requireSession(new Request('http://localhost', { headers: { Cookie: f.cookie } }))).status, 503);
});

test('the durable login limit is atomic, survives module reloads and cannot be bypassed with spoofed IPs', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 21 }, () => f.auth.login(f.authRequest('/api/auth/login', { password: 'wrong' }, { 'X-Forwarded-For': crypto.randomUUID() }))));
  // The fixture already consumed one attempt to authenticate its test session.
  assert.equal(results.filter(r => r.status === 401).length, 19);
  assert.equal(results.filter(r => r.status === 429).length, 2);
  assert.equal(await f.count('auth_attempts'), 20);
  const retry = await f.reloadAuth().login(f.authRequest('/api/auth/login', { password: testPassword }));
  assert.equal(retry.status, 429);
  assert.equal(retry.headers.get('retry-after'), '900');
  await f.raw.prepare('UPDATE auth_attempts SET created=0').run();
  assert.equal((await f.auth.login(f.authRequest('/api/auth/login', { password: testPassword }))).status, 200);
  assert.equal(await f.count('auth_attempts'), 1);
});
