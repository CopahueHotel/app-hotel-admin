import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export const operationalTables = [
  'bookings', 'room_nights', 'products', 'stock_movements', 'sales', 'expenses',
  'cash_movements', 'daily_closes', 'meal_overrides', 'operation_requests',
  'room_rates', 'booking_terms', 'room_blocks', 'booking_guests', 'meal_suspensions',
  'meal_services', 'meal_plans', 'beverage_accounts', 'beverage_dispatches',
  'beverage_settlements', 'beverage_transfers', 'beverage_returns', 'beverage_corrections',
  'purchase_documents', 'purchase_lines', 'purchase_receipts', 'supplier_payment_details',
  'suppliers', 'supplier_deliveries', 'menu_plans', 'menu_actuals', 'employees',
  'staff_events', 'staff_reports', 'access_checks', 'password_resets',
  'auth_attempts', 'recovery_attempts',
];
const preservedTables = ['users', 'roles', 'access_state', 'auth_sessions', 'rooms', 'settings', 'audit_log'];
const accessActions = ['bootstrapAdmin', 'userSave', 'userReset', 'rolePermissions', 'passwordRecovery', 'recoveryLinkLocal', 'operationalReset'];

// Maintenance only, while the app is stopped. Never exposed through an API.
export function resetOperationalData(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  const unknown = tables.filter(name => !operationalTables.includes(name) && !preservedTables.includes(name) && !name.startsWith('sqlite_') && !name.startsWith('_cf_') && name !== 'd1_migrations' && name !== '__drizzle_migrations');
  if (unknown.length) throw Error('Esquema no reconocido; no se limpio la base: ' + unknown.join(', '));
  const beforeUsers = db.prepare('SELECT * FROM users ORDER BY id').all();
  const beforeRoles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  if (!beforeUsers.some(user => user.active && JSON.parse(user.roles).includes('superadmin'))) throw Error('Falta un superadministrador activo.');
  const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  const counts = Object.fromEntries(operationalTables.map(name => [name, db.prepare(`SELECT count(*) n FROM "${name}"`).get().n]));
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');
  try {
    // Remove immutable-history/financial guards only inside this transaction,
    // then restore their exact definitions before committing the reset.
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`);
    for (const table of operationalTables) db.exec(`DELETE FROM "${table}"`);
    db.prepare(`DELETE FROM audit_log WHERE action NOT IN (${accessActions.map(() => '?').join(',')})`).run(...accessActions);
    db.exec("UPDATE rooms SET state='Pendiente de limpieza',note=''; INSERT OR REPLACE INTO settings VALUES ('initialized','1'); INSERT OR REPLACE INTO settings VALUES ('mealPrice','0');");
    for (const trigger of triggers) db.exec(trigger.sql);
    db.prepare('INSERT INTO audit_log (id,created,actor,action,detail,actor_id) VALUES (?,?,?,?,?,NULL)').run(randomUUID(), new Date().toISOString(), 'Consola del servidor', 'operationalReset', JSON.stringify({ reason: 'Limpieza de datos ficticios autorizada antes de la apertura operativa', deleted: counts, rooms: 'Estructura conservada; estado pendiente de verificar' }));
    if (db.prepare('PRAGMA foreign_key_check').all().length || db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('La verificacion de integridad fallo.');
    if (JSON.stringify(beforeUsers) !== JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all()) || JSON.stringify(beforeRoles) !== JSON.stringify(db.prepare('SELECT * FROM roles ORDER BY id').all())) throw Error('Los accesos no se conservaron.');
    db.exec('COMMIT;');
    return counts;
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== '--confirm-fictitious-data' || realpathSync('.') !== '/opt/hotel-admin') throw Error('Uso exclusivo de mantenimiento en /opt/hotel-admin, con --confirm-fictitious-data y servicio detenido.');
  const config = readFileSync('.dev.vars', 'utf8');
  if (!/^AUTH_ORIGIN=["']?https:\/\/admin\.copahuehotel\.com\.ar["']?\s*$/m.test(config) || /^APP_ENV=["']?test/m.test(config)) throw Error('Origen de Administracion no verificado.');
  const root = resolve('.wrangler/state/v3/d1');
  const files = [];
  function walk(folder) { for (const entry of readdirSync(folder)) { const file = join(folder, entry); if (statSync(file).isDirectory()) walk(file); else if (entry.endsWith('.sqlite') && entry !== 'metadata.sqlite') files.push(file); } }
  walk(root);
  if (files.length !== 1) throw Error('No se encontro una unica base de datos.');
  const db = new DatabaseSync(files[0]);
  try { const counts = resetOperationalData(db); console.log('Limpieza completada. Usuarios, contrasenas, permisos, historial de acceso y habitaciones conservados.'); console.log(JSON.stringify(counts)); }
  finally { db.close(); }
}
