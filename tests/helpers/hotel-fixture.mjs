import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import { Miniflare } from 'miniflare';
import ts from 'typescript';
import { z } from 'zod';
import path from 'node:path';
export const testPassword = 'test-only-password';
const salt = '0123456789abcdef0123456789abcdef';
const passwordHash = 'pbkdf2-sha256:100000:' + salt + ':' + pbkdf2Sync(testPassword, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');

// Run the actual API against an isolated, nonpersistent D1/Miniflare database.
// Only the binding is injected; SQL, triggers and transactional batches are real.
export async function fixture(t, beforeMigration) {
  const mf = new Miniflare({
    modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-05-15', d1Databases: ['DB'],
  });
  t.after(() => mf.dispose());
  const raw = await mf.getD1Database('DB');
  const migrations = readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    if (file.startsWith('0002') && beforeMigration) await beforeMigration(raw);
    for (const sql of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint')) {
      if (sql.trim()) await raw.prepare(sql).run();
    }
  }
  let gate;
  const db = {
    prepare(sql) {
      const wrap = (statement, values = []) => ({
        sql, values, statement,
        bind(...args) { return wrap(statement.bind(...args), args); },
        first(...args) { return statement.first(...args); },
        run() { return statement.run(); },
      });
      return wrap(raw.prepare(sql));
    },
    async batch(statements) {
      if (gate) await gate(statements);
      return raw.batch(statements.map(s => s.statement));
    },
  };
  const authEnv = { AUTH_ORIGIN: 'http://localhost', AUTH_PASSWORD_HASH: passwordHash };
  const modules = new Map();
  const errors = [];
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const exports = {};
    modules.set(file, exports);
    new Function('require', 'exports', 'console', code)(name => {
      if (name === '@/lib/hotel-db') return { database: () => db };
      if (name === 'cloudflare:workers') return { env: authEnv };
      if (name === '@/lib/hotel-auth') return load('lib/hotel-auth.ts');
      if (name === 'next/server') return { NextResponse: { next: () => new Response(null, { headers: { 'x-middleware-next': '1' } }) } };
      if (name === 'zod') return { z };
      if (name.startsWith('@/')) return load(name.slice(2)+'.ts');
      if (name.startsWith('./')) return load(path.posix.join(path.posix.dirname(file),name+'.ts'));
      throw Error('Unexpected import: ' + name);
    }, exports, { ...console, error: error => errors.push(error) });
    return exports;
  }
  const auth = load('lib/hotel-auth.ts');
  const api = load('app/api/hotel/route.ts');
  const authRequest = (path, data, headers = {}) => new Request('http://localhost' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: authEnv.AUTH_ORIGIN, ...headers },
    body: JSON.stringify(data),
  });
  const signedIn = await auth.login(authRequest('/api/auth/login', { password: testPassword }));
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await api.GET(new Request('http://localhost/api/hotel', { headers: { Cookie: cookie } }))).status, 200);
  async function post(action, data, key = crypto.randomUUID()) {
    const r = await api.POST(new Request('http://localhost/api/hotel', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: authEnv.AUTH_ORIGIN, ...(key ? { 'Idempotency-Key': key } : {}) },
      body: JSON.stringify({ action, data }),
    }));
    const result = { status: r.status, ...await r.json() };
    if (result.status >= 500) throw new AggregateError(errors, result.error);
    return result;
  }
  const one = (sql, ...args) => raw.prepare(sql).bind(...args).first();
  const count = async table => (await one(`SELECT COUNT(*) n FROM ${table}`)).n;
  return { raw, post, one, count, api, auth, authEnv, authRequest, cookie, load, reloadAuth() { modules.delete('lib/hotel-auth.ts'); return load('lib/hotel-auth.ts'); }, setGate(fn) { gate = fn; } };
}
