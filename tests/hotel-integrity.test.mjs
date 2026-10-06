import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import ts from 'typescript';
import { z } from 'zod';

// Run the actual API against an isolated, nonpersistent D1/Miniflare database.
// Only the binding is injected; SQL, triggers and transactional batches are real.
async function fixture(t, beforeMigration) {
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
      });
      return wrap(raw.prepare(sql));
    },
    async batch(statements) {
      if (gate) await gate(statements);
      return raw.batch(statements.map(s => s.statement));
    },
  };
  const code = ts.transpileModule(readFileSync('app/api/hotel/route.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const api = {};
  const errors = [];
  new Function('require', 'exports', 'console', code)(name => {
    if (name === '@/lib/hotel-db') return { database: () => db };
    if (name === 'zod') return { z };
    throw Error(`Unexpected import: ${name}`);
  }, api, { ...console, error: error => errors.push(error) });
  assert.equal((await api.GET()).status, 200);
  async function post(action, data, key = crypto.randomUUID()) {
    const r = await api.POST(new Request('http://localhost/api/hotel', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      body: JSON.stringify({ action, data }),
    }));
    const result = { status: r.status, ...await r.json() };
    if (result.status >= 500) throw new AggregateError(errors, result.error);
    return result;
  }
  const one = (sql, ...args) => raw.prepare(sql).bind(...args).first();
  const count = async table => (await one(`SELECT COUNT(*) n FROM ${table}`)).n;
  return { raw, post, one, count, setGate(fn) { gate = fn; } };
}

const sale = {
  date: '2026-10-02', booking: 'demo-1', customer: 'Test', kind: 'Incluida',
  product: '', label: 'Cena', service: 'Cena', qty: 2, price: 0, account: 'Efectivo', charge: false,
};
const movement = { date: sale.date, account: 'Efectivo', amount: 10, kind: 'Aporte de socios', label: 'Test' };

test('included meals normalize labels and preserve MP/PC quotas', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('sale', { ...sale, label: 'Custom' })).status, 200);
  assert.deepEqual(await f.one('SELECT label,service FROM sales LIMIT 1'), { label: 'Cena', service: 'Cena' });
  assert.equal((await f.post('sale', { ...sale, label: 'Other' })).status, 400);
  assert.equal((await f.post('meal', { booking: sale.booking, date: sale.date, meal: 'Almuerzo' })).status, 400);
  assert.equal((await f.post('meal', { booking: sale.booking, date: sale.date, meal: 'Cena' })).status, 200);
  assert.equal((await f.post('sale', { ...sale, service: 'Desayuno' })).status, 200);
  assert.equal((await f.post('sale', { ...sale, qty: 0.5, date: '2026-10-03' })).status, 400);
  assert.equal((await f.post('sale', { ...sale, product: 'agua', date: '2026-10-03' })).status, 400);
  for (const service of ['Desayuno', 'Almuerzo', 'Cena']) {
    assert.equal((await f.post('sale', { ...sale, booking: 'demo-2', service })).status, 200);
  }
  assert.equal((await f.post('sale', { ...sale, date: '2026-10-05' })).status, 400);
  // Before serving, a change is allowed; after breakfast it remains allowed.
  assert.equal((await f.post('sale', { ...sale, date: '2026-10-03', service: 'Desayuno' })).status, 200);
  assert.equal((await f.post('meal', { booking: sale.booking, date: '2026-10-03', meal: 'Almuerzo' })).status, 200);
  assert.equal((await f.post('sale', { ...sale, date: '2026-10-03', service: 'Almuerzo' })).status, 200);
  assert.equal((await f.post('meal', { booking: sale.booking, date: '2026-10-03', meal: 'Cena' })).status, 400);
});

test('concurrent included meals and meal changes cannot bypass quotas', async t => {
  const f = await fixture(t);
  let release;
  const wait = new Promise(r => { release = r; });
  let arrivals = 0;
  f.setGate(async statements => {
    if (!statements.some(s => s.sql.startsWith('INSERT INTO sales'))) return;
    if (++arrivals === 2) release();
    await wait;
  });
  const results = await Promise.all([f.post('sale', sale), f.post('sale', sale)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal((await f.one('SELECT SUM(qty) n FROM sales')).n, 2);
  f.setGate(undefined);
  // Delay an already validated choice until a conflicting meal is committed.
  let arrive, resume;
  const reached = new Promise(r => { arrive = r; });
  const paused = new Promise(r => { resume = r; });
  f.setGate(async statements => {
    if (statements.some(s => s.sql.startsWith('INSERT INTO meal_overrides'))) { arrive(); await paused; }
  });
  const pending = f.post('meal', { booking: sale.booking, date: '2026-10-03', meal: 'Almuerzo' });
  await reached;
  assert.equal((await f.post('sale', { ...sale, date: '2026-10-03' })).status, 200);
  resume();
  assert.equal((await pending).status, 400);
  assert.equal(await f.count('meal_overrides'), 0);
});

test('closed dates reject in-flight operations and roll back the whole batch', async t => {
  const f = await fixture(t);
  let arrive, resume;
  const reached = new Promise(r => { arrive = r; });
  const wait = new Promise(r => { resume = r; });
  f.setGate(async statements => {
    if (statements.some(s => s.values.includes('Delayed'))) { arrive(); await wait; }
  });
  const key = crypto.randomUUID();
  const pending = f.post('purchase', { date: sale.date, due: sale.date, supplier: 'Delayed', product: 'agua', qty: 1, cost: 10, paid: true, account: 'Efectivo' }, key);
  await reached;
  assert.equal((await f.post('close', { date: sale.date, counted: 120000, note: '' })).status, 200);
  resume();
  assert.equal((await pending).status, 400);
  assert.equal(await f.one('SELECT * FROM operation_requests WHERE key=?', key), null);
  assert.equal(await f.count('expenses'), 1);
  assert.equal((await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n, 42);
  assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE account='Efectivo'")).n, 12000000);
  assert.equal((await f.post('movement', movement)).status, 400);
  assert.equal((await f.post('meal', { booking: sale.booking, date: sale.date, meal: 'Almuerzo' })).status, 400);
  assert.equal((await f.post('movement', { ...movement, date: '2026-10-03' })).status, 200);
});

test('close calculates current cash atomically and explains its adjustment', async t => {
  const f = await fixture(t);
  let arrive, resume;
  const reached = new Promise(r => { arrive = r; });
  const wait = new Promise(r => { resume = r; });
  f.setGate(async statements => {
    if (statements.some(s => s.sql.startsWith('INSERT INTO daily_closes'))) { arrive(); await wait; }
  });
  const key = crypto.randomUUID();
  const pending = f.post('close', { date: sale.date, counted: 120000, note: 'Diferencia contada' }, key);
  await reached;
  assert.equal((await f.post('movement', movement)).status, 200);
  resume();
  assert.equal((await pending).status, 200);
  f.setGate(undefined);
  assert.deepEqual(await f.one('SELECT expected,counted FROM daily_closes'), { expected: 12001000, counted: 12000000 });
  assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE account='Efectivo'")).n, 12000000);
  assert.equal((await f.one("SELECT amount FROM cash_movements WHERE kind='Ajuste de cierre'")).amount, -1000);
  assert.equal((await f.post('close', { date: sale.date, counted: 120000, note: 'Diferencia contada' }, key)).status, 200);
  assert.equal(await f.count('daily_closes'), 1);
  assert.equal((await f.post('close', { date: '2026-10-03', counted: 1, note: '' })).status, 400);
  assert.equal(await f.count('daily_closes'), 1);
  assert.equal((await f.post('close', { date: '2026-10-01', counted: 120000, note: '' })).status, 400);
});

test('idempotency protects retries, races, conflicting payloads and audit records', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('movement', movement, null)).status, 400);
  const key = crypto.randomUUID();
  const before = await f.count('cash_movements');
  assert.deepEqual((await Promise.all([f.post('movement', movement, key), f.post('movement', movement, key)])).map(r => r.status), [200, 200]);
  assert.equal(await f.count('cash_movements'), before + 1);
  assert.equal(await f.count('audit_log'), 1);
  assert.equal((await f.post('movement', movement, key)).status, 200);
  assert.equal((await f.post('movement', { ...movement, amount: 11 }, key)).status, 409);
  assert.equal((await f.post('close', { date: sale.date, counted: 120010, note: '' })).status, 200);
  assert.equal((await f.post('movement', movement, key)).status, 200);
  assert.equal(await f.count('cash_movements'), before + 1);
});

test('financial flows keep stock, pending balances and transaction protections', async t => {
  const f = await fixture(t);
  const beverage = { ...sale, kind: 'Bebida', product: 'agua', price: 2500, qty: 2, charge: true };
  const saleKey = crypto.randomUUID();
  assert.equal((await f.post('sale', beverage, saleKey)).status, 200);
  assert.equal((await f.post('sale', beverage, saleKey)).status, 200);
  assert.equal((await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n, 40);
  const balance = async () => (await f.one("SELECT b.amount+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=b.id),0)-COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=b.id AND kind='Cobro'),0) n FROM bookings b WHERE id='demo-1'")).n;
  assert.equal(await balance(), 20500000);
  const payment = { date: sale.date, booking: sale.booking, amount: 205000, account: 'Banco' };
  const payKey = crypto.randomUUID();
  assert.equal((await f.post('payment', payment, payKey)).status, 200);
  assert.equal((await f.post('payment', payment, payKey)).status, 200);
  assert.equal(await balance(), 0);
  assert.equal((await f.post('payment', { ...payment, amount: 1 })).status, 400);
  assert.equal((await f.post('status', { id: sale.booking, status: 'Finalizada' })).status, 200);
  const purchase = { date: sale.date, due: '2026-10-05', supplier: 'Test supplier', product: 'agua', qty: 3, cost: 100, paid: false, account: 'Banco' };
  const purchaseKey = crypto.randomUUID();
  assert.equal((await f.post('purchase', purchase, purchaseKey)).status, 200);
  assert.equal((await f.post('purchase', purchase, purchaseKey)).status, 200);
  const expense = await f.one("SELECT * FROM expenses WHERE supplier='Test supplier'");
  assert.equal(expense.amount, 30000);
  const partial = { date: sale.date, id: expense.id, amount: 100, account: 'Banco' };
  const partialKey = crypto.randomUUID();
  assert.equal((await f.post('payExpense', partial, partialKey)).status, 200);
  assert.equal((await f.post('payExpense', partial, partialKey)).status, 200);
  assert.equal((await f.post('payExpense', { ...partial, amount: 201 })).status, 400);
  assert.equal((await f.post('payExpense', { ...partial, amount: 200 })).status, 200);
  assert.equal((await f.one("SELECT COALESCE(SUM(amount),0) n FROM cash_movements WHERE ref=? AND kind='Pago'", expense.id)).n, -30000);
  const total = (await f.one('SELECT SUM(amount) n FROM cash_movements')).n;
  const transferKey = crypto.randomUUID();
  const transfer = { date: sale.date, from: 'Banco', to: 'Billetera', amount: 100 };
  assert.equal((await f.post('transfer', transfer, transferKey)).status, 200);
  assert.equal((await f.post('transfer', transfer, transferKey)).status, 200);
  assert.equal((await f.one("SELECT COUNT(*) n FROM cash_movements WHERE kind='Transferencia'")).n, 2);
  assert.equal((await f.one('SELECT SUM(amount) n FROM cash_movements')).n, total);
  assert.equal((await f.post('stock', { date: sale.date, product: 'agua', qty: 999, reason: 'Merma' })).status, 400);
  const booking = { guest: 'Test', room: 2, start: '2026-10-02', end: '2026-10-03', pax: 1, regime: 'Desayuno', meal: 'Cena', amount: 100, source: 'Directa' };
  assert.equal((await f.post('booking', booking)).status, 200);
  assert.equal((await f.post('booking', booking)).status, 400);
  assert.equal((await f.post('booking', { ...booking, start: booking.end, end: '2026-10-04' })).status, 200);
});

test('concurrent stock sales, collections and supplier payments retain database limits', async t => {
  const f = await fixture(t);
  const scenarios = [
    ['sale', { ...sale, kind: 'Bebida', product: 'agua', qty: 30, price: 2500 }],
    ['payment', { date: sale.date, booking: sale.booking, amount: 150000, account: 'Banco' }],
    ['payExpense', { date: sale.date, id: 'expense-1', amount: 60000, account: 'Banco' }],
  ];
  for (const [action, data] of scenarios) {
    let release;
    const wait = new Promise(r => { release = r; });
    let arrivals = 0;
    f.setGate(async statements => {
      if (!statements.some(s => s.sql.startsWith('INSERT INTO operation_requests'))) return;
      if (++arrivals === 2) release();
      await wait;
    });
    const before = await f.count('operation_requests');
    const results = await Promise.all([f.post(action, data), f.post(action, data)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400], action);
    assert.equal(await f.count('operation_requests'), before + 1);
  }
  assert.equal((await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n, 12);
  assert.equal((await f.one("SELECT SUM(amount) n FROM cash_movements WHERE ref='demo-1' AND kind='Cobro'")).n, 25000000);
  assert.equal((await f.one("SELECT -SUM(amount) n FROM cash_movements WHERE ref='expense-1' AND kind='Pago'")).n, 6000000);
});

test('migration retains historical meals and conservatively handles unknown services', async t => {
  const f = await fixture(t, async raw => {
    await raw.prepare("INSERT INTO rooms VALUES (99,'Doble','Limpia','')").run();
    await raw.prepare("INSERT INTO bookings VALUES ('legacy','Legacy','',99,'2026-10-01','2026-10-05',2,'MP','Cena',0,'Alojado','Directa','')").run();
    await raw.prepare("INSERT INTO sales VALUES ('old-known','2026-10-01','legacy','Legacy','Cena',2,0,'Incluida',NULL,NULL)").run();
    await raw.prepare("INSERT INTO sales VALUES ('old-unknown','2026-10-02','legacy','Legacy','Custom',2,0,'Incluida',NULL,NULL)").run();
  });
  assert.equal((await f.one("SELECT service FROM sales WHERE id='old-known'")).service, 'Cena');
  assert.equal((await f.one("SELECT service FROM sales WHERE id='old-unknown'")).service, null);
  assert.equal((await f.post('sale', { ...sale, booking: 'legacy' })).status, 400);
  assert.equal((await f.post('meal', { booking: 'legacy', date: sale.date, meal: 'Almuerzo' })).status, 400);
  assert.equal((await f.one("SELECT COUNT(*) n FROM sales WHERE booking='legacy'")).n, 2);
});
