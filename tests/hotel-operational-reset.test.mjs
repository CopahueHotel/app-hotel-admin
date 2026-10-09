import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import {resetOperationalData,operationalTables} from '../scripts/reset-operational-data.mjs';

function setup(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 const exports={};new Function('exports',ts.transpileModule(readFileSync('modules/hotel/seed.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
 const adapter={prepare(sql){const stmt=db.prepare(sql);return {first:async()=>stmt.get(),bind(...values){return {stmt,values}}};},async batch(statements){db.exec('BEGIN');try{for(const s of statements)s.stmt.run(...s.values);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,seed:demo=>exports.seed(adapter,demo)};
}
test('fresh Administration has rooms but no fictitious operations; demo data require explicit opt-in',async t=>{
 const {db,seed}=setup(t);await seed();
 assert.equal(db.prepare('SELECT count(*) n FROM rooms').get().n,17);
 for(const table of ['bookings','products','stock_movements','cash_movements','expenses'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM rooms WHERE state='Pendiente de limpieza' AND note=''").get().n,17);
 await seed(true);assert.equal(db.prepare('SELECT count(*) n FROM bookings').get().n,0);
});
test('operational reset preserves accounts and access history, clears all fictional circuits and restores guards',async t=>{
 const {db,seed}=setup(t);await seed(true);
 const hash='pbkdf2-sha256:600000:'+ 'a'.repeat(32)+':'+ 'b'.repeat(64);
 db.prepare("INSERT INTO users VALUES ('admin','Administrador','admin@example.test',1,'[\"superadmin\"]',?,0)").run(hash);
 db.exec("INSERT INTO audit_log VALUES ('access','2026-10-09','Administrador','bootstrapAdmin','{}','admin'); INSERT INTO audit_log VALUES ('fiction','2026-10-09','Ejemplo','payment','{}',NULL);");
 const beforeUsers=db.prepare('SELECT * FROM users').all(),beforeRoles=db.prepare('SELECT * FROM roles').all(),beforeTriggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
 db.exec('CREATE TABLE unexpected_operation (id TEXT)');assert.throws(()=>resetOperationalData(db),/Esquema no reconocido/);assert.equal(db.prepare('SELECT count(*) n FROM bookings').get().n,5);db.exec('DROP TABLE unexpected_operation');
 const counts=resetOperationalData(db);assert.equal(counts.bookings,5);
 for(const table of operationalTables)assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
 assert.deepEqual(db.prepare('SELECT * FROM users').all(),beforeUsers);assert.deepEqual(db.prepare('SELECT * FROM roles').all(),beforeRoles);
 assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all(),beforeTriggers);
 assert.equal(db.prepare('SELECT count(*) n FROM audit_log').get().n,2);assert.equal(db.prepare("SELECT count(*) n FROM audit_log WHERE action='operationalReset' AND actor_id IS NULL").get().n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM rooms').get().n,17);assert.equal(db.prepare("SELECT count(*) n FROM rooms WHERE state='Pendiente de limpieza' AND note=''").get().n,17);
 assert.throws(()=>db.exec("DELETE FROM users WHERE id='admin'"),/HOT_HISTORY_IMMUTABLE/);
 await seed(true);assert.equal(db.prepare('SELECT count(*) n FROM bookings').get().n,0);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
