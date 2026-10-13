import importlib.util, pathlib, sqlite3, tempfile, unittest, json
spec=importlib.util.spec_from_file_location('hotel_backup',pathlib.Path(__file__).with_name('hotel_backup.py'))
backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)

class BackupTests(unittest.TestCase):
    def test_wal_snapshot_is_consistent_and_does_not_change_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);source=root/'live.sqlite';target=root/'restored.sqlite'
            live=sqlite3.connect(source)
            live.execute('PRAGMA journal_mode=WAL')
            live.execute('CREATE TABLE movements (id INTEGER PRIMARY KEY, amount INTEGER)')
            live.execute('INSERT INTO movements VALUES (1,12345)');live.commit()
            live.execute('INSERT INTO movements VALUES (2,99999)')
            stats=backup.snapshot_sqlite(source,target)
            self.assertEqual(stats['movements']['rows'],1)
            restored=sqlite3.connect(target)
            self.assertEqual(restored.execute('SELECT amount FROM movements').fetchone()[0],12345)
            self.assertEqual(live.execute('SELECT count(*) FROM movements').fetchone()[0],2)
            live.rollback();live.close();restored.close()

    def test_restore_rejects_changed_config_or_database(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);app=root/'app';app.mkdir()
            config=app/'.dev.vars';config.write_text('AUTH_ORIGIN="http://localhost"')
            database=app/'test.sqlite';db=sqlite3.connect(database)
            db.execute('CREATE TABLE history (id INTEGER PRIMARY KEY)');db.execute('INSERT INTO history VALUES (1)');db.commit()
            stats=backup.statistics(db);db.close()
            manifest={'files':{'app/.dev.vars':backup.digest(config),'app/test.sqlite':backup.digest(database)},'tables':{'test.sqlite':stats}}
            (root/'manifest.json').write_text(json.dumps(manifest))
            backup.verify_payload(root)
            config.write_text('changed')
            with self.assertRaises(RuntimeError):backup.verify_payload(root)
            config.write_text('AUTH_ORIGIN="http://localhost"')
            db=sqlite3.connect(database);db.execute('INSERT INTO history VALUES (2)');db.commit();db.close()
            manifest['files']['app/test.sqlite']=backup.digest(database)
            (root/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(AssertionError):backup.verify_payload(root)

if __name__=='__main__':unittest.main()
