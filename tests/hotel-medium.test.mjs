import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { fixture } from './helpers/hotel-fixture.mjs';

function loadView(file) {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText)(exports, name => {
    assert.ok(name.startsWith('@/'), 'Unexpected view dependency: ' + name);
    return loadView(name.slice(2) + '.ts');
  });
  return exports;
}
const view = loadView('lib/hotel-view.ts');

test('guest sales paid immediately appear in history without increasing debt or collection limits', async t => {
  const f = await fixture(t);
  const sale = { date: '2026-10-02', booking: 'demo-1', customer: 'Unused', kind: 'Comida',
    product: 'none', label: 'Almuerzo', qty: 1, price: 123.45, account: 'Banco', charge: false };
  const key = crypto.randomUUID();
  assert.equal((await f.post('sale', sale, key)).status, 200);
  assert.equal((await f.post('sale', sale, key)).status, 200);
  const paid = await f.one("SELECT * FROM sales WHERE booking='demo-1'");
  assert.equal(paid.amount, 12345);
  assert.equal(paid.account, 'Banco');
  assert.equal(paid.customer, 'Lucía Fernández');
  assert.equal(await f.count('sales'), 1);
  assert.equal((await f.one("SELECT amount FROM cash_movements WHERE ref=? AND kind='Venta'", paid.id)).amount, 12345);
  const snapshot = async () => await (await f.api.GET(new Request('http://localhost/api/hotel', {
    headers: { Cookie: f.cookie },
  }))).json();
  const balance = async () => {
    const d = await snapshot();
    return view.bookingBalance(d.bookings.find(b => b.id === 'demo-1'), d.sales, d.cash_movements);
  };
  assert.equal(await balance(), 20000000);
  assert.equal((await f.post('payment', { date: sale.date, booking: sale.booking, amount: 200123.45, account: 'Banco' })).status, 400);
  assert.equal((await f.post('sale', { ...sale, kind: 'Bebida', product: 'agua', qty: 2, price: 2500.75, charge: true })).status, 200);
  assert.equal(await balance(), 20500150);
  assert.equal((await f.one("SELECT SUM(qty) n FROM stock_movements WHERE product='agua'")).n, 40);
  // Both requests read the same balance before their transactional batches.
  // Together they exceed debt by one cent, so the SQLite trigger must reject one.
  let release;
  const wait = new Promise(r => { release = r; });
  let arrivals = 0;
  f.setGate(async statements => {
    if (!statements.some(s => s.sql.startsWith('INSERT INTO operation_requests'))) return;
    if (++arrivals === 2) release();
    await wait;
  });
  const payment = { date: sale.date, booking: sale.booking, account: 'Banco' };
  const results = await Promise.all([
    f.post('payment', { ...payment, amount: 205001.50 }),
    f.post('payment', { ...payment, amount: 0.01 }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  f.setGate(null);
  const remaining = await balance();
  assert.ok(remaining >= 0);
  if (remaining) assert.equal((await f.post('payment', { ...payment, amount: remaining / 100 })).status, 200);
  assert.equal(await balance(), 0);
  assert.equal((await f.post('payment', { ...payment, amount: 0.01 })).status, 400);
  assert.equal((await f.post('status', { id: sale.booking, status: 'Finalizada' })).status, 200);
  assert.equal((await f.one('SELECT SUM(amount) n FROM cash_movements WHERE ref=?', sale.booking)).n, 30500150);
});

test('external sales and no-cost guest consumptions preserve their treatment', async t => {
  const f = await fixture(t);
  const sale = { date: '2026-10-02', booking: 'external', customer: 'External', kind: 'Comida',
    product: 'none', label: 'Cena', qty: 1, price: 12.34, account: 'Efectivo', charge: false };
  assert.equal((await f.post('sale', sale)).status, 200);
  const external = await f.one("SELECT * FROM sales WHERE customer='External'");
  assert.equal(external.booking, null);
  assert.equal(external.account, 'Efectivo');
  assert.equal(external.amount, 1234);
  assert.equal((await f.post('sale', { ...sale, booking: 'demo-1', kind: 'Cortesía' })).status, 200);
  const courtesy = await f.one("SELECT * FROM sales WHERE kind='Cortesía'");
  assert.equal(courtesy.booking, 'demo-1');
  assert.equal(courtesy.amount, 0);
  assert.equal(courtesy.account, null);
  assert.equal((await f.post('status', { id: 'demo-1', status: 'Cancelada' })).status, 400);
});

test('money and CSV preserve cents, decimal commas, quoting and formula protections', () => {
  assert.match(view.currency(12345), /123,45/);
  assert.match(view.currency(1), /0,01/);
  assert.match(view.currency(-1), /-.*0,01/);
  assert.match(view.currency(0), /0,00/);
  assert.equal(view.serializeCsv([
    ['Concepto', 'Importe ARS'], ['Texto; con "comillas"', 123.45], [' =HYPERLINK("x")', -0.01],
  ]), '\uFEFF"Concepto";"Importe ARS"\r\n"Texto; con ""comillas""";"123,45"\r\n"\' =HYPERLINK(""x"")";"-0,01"');
});

test('exports use the same reservation, stock, date and activity filters as displayed rows', () => {
  const bookings = [
    { id: 'a', guest: 'Ana', room: 2, start: '2026-10-03' },
    { id: 'b', guest: 'Juan', room: 7, start: '2026-10-02' },
    { id: 'c', guest: 'ANA María', room: 3, start: '2026-10-01' },
  ];
  assert.deepEqual(view.filterBookings(bookings, 'ana').map(b => b.id), ['c', 'a']);
  assert.deepEqual(view.filterBookings(bookings, '7').map(b => b.id), ['b']);
  assert.deepEqual(bookings.map(b => b.id), ['a', 'b', 'c']);
  const products = [{ id: 'a', category: 'Bebidas' }, { id: 'b', category: 'Alimentos' }];
  assert.deepEqual(view.filterProducts(products, 'Bebidas').map(p => p.id), ['a']);
  assert.equal(view.filterProducts(products, 'Todos').length, 2);
  const cash = [
    { id: 'a', date: '2026-10-02', area: 'Hotel' },
    { id: 'b', date: '2026-10-02', area: 'Restaurante' },
    { id: 'c', date: '2026-10-02', area: 'Compartido' },
    { id: 'd', date: '2026-10-01', area: 'Hotel' },
    { id: 'e', date: '2026-10-03', area: 'Hotel' },
  ];
  assert.deepEqual(view.filterCash(cash, { date: '2026-10-02', area: 'Hotel' }).map(m => m.id), ['a', 'c']);
  assert.deepEqual(view.filterCash(cash, { from: '2026-10-02', to: '2026-10-03' }).map(m => m.id), ['a', 'b', 'c', 'e']);
  assert.equal(view.filterCash(cash, { from: '2026-10-03', to: '2026-10-01' }).length, 0);
});
