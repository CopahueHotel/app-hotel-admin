import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';

// Exercise the compiled worker and real proxy routing without persistent data.
const password = 'http-smoke-only-password';
const origin = 'https://test.hotel.example';
const salt = 'abcdef0123456789abcdef0123456789';
const passwordHash = `pbkdf2-sha256:100000:${salt}:${pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex')}`;
const mf = new Miniflare({
  modulesRoot: resolve('dist/server'),
  modules: [
    { type: 'ESModule', path: resolve('dist/server/index.js') },
    ...readdirSync('dist/server', { recursive: true }).filter(f => f.endsWith('.js') && f !== 'index.js')
      .map(f => ({ type: 'ESModule', path: resolve('dist/server', f) })),
  ],
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'], bindings: { AUTH_ORIGIN: origin, AUTH_PASSWORD_HASH: passwordHash },
});
try {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint')) {
      if (sql.trim()) await db.prepare(sql).run();
    }
  }
  const request = (path, options = {}) => mf.dispatchFetch('http://localhost' + path, { redirect: 'manual', ...options });
  const screen = await request('/');
  assert.ok([303, 307].includes(screen.status));
  assert.equal(screen.headers.get('location'), `${origin}/login`);
  assert.equal((await request('/api/hotel')).status, 401);
  assert.equal((await request('/api/hotel/personnel')).status, 401);
  assert.ok([303, 307].includes((await request('/?_rsc=smoke', { headers: { RSC: '1' } })).status));
  const loginPage = await request('/login');
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Ingresar/);
  const signedIn = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ password }),
  });
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get('set-cookie'), /; Secure/);
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/', { headers: { Cookie: cookie } })).status, 200);
  const staff=await request('/api/hotel/personnel', { headers: { Cookie: cookie } });
  assert.equal(staff.status,200);
  assert.ok(Array.isArray((await staff.json()).staff_reports));
  const records = await request('/api/hotel', { headers: { Cookie: cookie } });
  assert.equal(records.status, 200);
  assert.equal((await records.json()).rooms.length, 17);
  assert.equal((await request('/api/hotel', {
    method: 'POST', headers: { Cookie: cookie, Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}',
  })).status, 403);
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } })).status, 200);
  assert.equal((await request('/api/hotel', { headers: { Cookie: cookie } })).status, 401);
  console.log('HTTP compilado: pantalla y RSC protegidos, login, API autenticada, origen cruzado y logout verificados.');
} finally {
  await mf.dispose();
}
