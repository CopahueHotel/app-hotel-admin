#!/usr/bin/env python3
"""Encrypted backups of Administration. Never replaces the live database."""
import argparse, contextlib, datetime, hashlib, json, os, pathlib, secrets
import shutil, sqlite3, subprocess, tarfile, tempfile, time

APP = pathlib.Path('/opt/hotel-admin')
ROOT = pathlib.Path('/var/backups/hotel-admin-automatic')
REPO = ROOT / 'repository'
KEY = pathlib.Path('/etc/hotel-backup/restic-password')
PAYLOAD = ROOT / 'payload'
STATUS = ROOT / 'status.json'
CODE = ['app','components','modules','lib','hooks','public','dist','drizzle','scripts',
        'package.json','package-lock.json','wrangler.local.json','cloudflare-env.d.ts',
        '.deployed-revision']

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def digest(file):
    sha = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(chunk)
    return sha.hexdigest()

def write_json(path, value):
    temporary = path.with_suffix('.partial')
    temporary.write_text(json.dumps(value, indent=2))
    temporary.chmod(0o600)
    temporary.replace(path)

def statistics(db):
    result = {}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
        quoted = '"' + name.replace('"', '""') + '"'
        rows = db.execute('SELECT * FROM ' + quoted).fetchall()
        encoded = json.dumps(sorted(rows, key=repr), default=lambda value: value.hex(), ensure_ascii=False).encode()
        result[name] = {'rows': len(rows), 'sha256': hashlib.sha256(encoded).hexdigest()}
    return result

def snapshot_sqlite(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    live = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=30)
    target = sqlite3.connect(destination)
    try:
        live.backup(target, pages=256, sleep=0.02)
        assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not target.execute('PRAGMA foreign_key_check').fetchall()
        return statistics(target)
    finally:
        target.close(); live.close()

def capture(app, target):
    target.mkdir(parents=True, exist_ok=True)
    (target/'app').mkdir()
    paths = list((app/'.wrangler/state/v3/d1').rglob('*.sqlite'))
    main = [file for file in paths if file.name != 'metadata.sqlite']
    if len(main) != 1:
        raise RuntimeError('Expected one Administration database')
    config = app/'.dev.vars'
    before_config = digest(config)
    lock_before = digest(app/'package-lock.json')
    revision = (app/'.deployed-revision').read_text().strip() if (app/'.deployed-revision').exists() else 'unknown'
    for name in CODE:
        source, destination = app/name, target/'app'/name
        if source.is_symlink():
            raise RuntimeError('Unexpected application symlink')
        if source.is_dir():
            shutil.copytree(source, destination, symlinks=False)
        elif source.is_file():
            shutil.copy2(source, destination)
    shutil.copy2(config, target/'app/.dev.vars')
    data = {}
    for file in paths:
        relative = file.relative_to(app)
        data[str(relative)] = snapshot_sqlite(file.resolve(), target/'app'/relative)
    if digest(config) != before_config or digest(app/'package-lock.json') != lock_before:
        raise RuntimeError('Configuration changed during capture; retry')
    for file in (target/'app').rglob('*'):
        relative=file.relative_to(target/'app')
        if file.is_file() and '.wrangler' not in relative.parts:
            if not (app/relative).is_file() or digest(file)!=digest(app/relative):
                raise RuntimeError('Release changed during capture; retry')
    system = target/'system'
    system.mkdir()
    for name in ['nginx','letsencrypt']:
        source = pathlib.Path('/etc')/name
        if source.exists():
            shutil.copytree(source, system/name, symlinks=True)
    for name in ['hotel-admin.service','hotel-admin.service.d','hotel-backup.service','hotel-backup.timer',
                 'hotel-backup-restore-test.service','hotel-backup-restore-test.timer']:
        source = pathlib.Path('/etc/systemd/system')/name
        if source.is_dir():
            shutil.copytree(source, system/name)
        elif source.is_file():
            shutil.copy2(source, system/name)
    if pathlib.Path('/usr/local/sbin/hotel-backup').exists():
        shutil.copy2('/usr/local/sbin/hotel-backup',system/'hotel-backup')
    manifest = {'created': now(), 'revision': revision, 'database': str(main[0].relative_to(app)),
                'tables': data, 'files': {str(file.relative_to(target)): digest(file)
                for file in target.rglob('*') if file.is_file() and not file.is_symlink()}}
    write_json(target/'manifest.json', manifest)
    return manifest

def verify_payload(payload):
    manifest = json.loads((payload/'manifest.json').read_text())
    for relative, expected in manifest['files'].items():
        file = (payload/relative).resolve()
        if not file.is_relative_to(payload.resolve()) or digest(file) != expected:
            raise RuntimeError('Restored file integrity failed')
    for relative, expected in manifest['tables'].items():
        database = payload/'app'/relative
        db = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
        try:
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            assert statistics(db) == expected
        finally:
            db.close()
    return manifest

def restic(*args, repo=REPO, capture_output=False):
    command = ['restic', '--repo', str(repo), '--password-file', str(KEY), *args]
    log = ROOT/'restic-private.log'
    with log.open('a') as errors:
        log.chmod(0o600)
        result = subprocess.run(command, stdout=subprocess.PIPE if capture_output else errors,
                                stderr=errors, text=True, timeout=1800)
    if result.returncode:
        raise RuntimeError('Restic failed; inspect the private log on the VPS')
    return result.stdout

def initialize():
    ROOT.mkdir(parents=True, exist_ok=True); ROOT.chmod(0o700)
    KEY.parent.mkdir(parents=True, exist_ok=True); KEY.parent.chmod(0o700)
    if not KEY.exists():
        with KEY.open('x') as stream:
            stream.write(secrets.token_urlsafe(48)+'\n')
        KEY.chmod(0o600)
    if not (REPO/'config').exists():
        if REPO.exists() and any(REPO.iterdir()):
            raise RuntimeError('Refusing to reinitialize a nonempty repository')
        restic('init')

def backup():
    initialize()
    if PAYLOAD.exists():
        shutil.rmtree(PAYLOAD)
    try:
        manifest = capture(APP, PAYLOAD)
        restic('backup', str(PAYLOAD), '--tag', 'hotel-admin', '--host', 'copahue-vps')
        restic('check')
        restic('forget', '--tag', 'hotel-admin', '--host', 'copahue-vps', '--keep-last','8','--keep-daily','14',
               '--keep-weekly','8','--keep-monthly','12','--prune')
        existing = json.loads(STATUS.read_text()) if STATUS.exists() else {}
        existing.update(local_backup=now(), revision=manifest['revision'], last_error=None,
                        offsite='PC download required; see the PC status file')
        write_json(STATUS, existing)
        print('Encrypted local backup completed; SQLite integrity verified.')
    finally:
        if PAYLOAD.exists():
            shutil.rmtree(PAYLOAD)

def export():
    initialize()
    snapshots = json.loads(restic('snapshots','--json','--tag','hotel-admin',capture_output=True))
    if not snapshots:
        raise RuntimeError('No snapshots available')
    folder = ROOT/'exports'; folder.mkdir(exist_ok=True)
    name = 'hotel-admin-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(4) + '.tar.gz'
    file = folder/name
    with tarfile.open(file, 'w:gz') as archive:
        archive.add(REPO, arcname='repository')
    file.chmod(0o600)
    # Only disposable encrypted export bundles; never delete manual backups.
    for previous in folder.glob('hotel-admin-*.tar.gz'):
        if time.time() - previous.stat().st_mtime > 7*86400 and previous != file:
            previous.unlink()
    print(json.dumps({'file': str(file), 'sha256': digest(file), 'created': now(),
                      'snapshot': snapshots[-1]['id']}))

def restore_test(archive=None):
    initialize()
    with tempfile.TemporaryDirectory(prefix='restore-', dir=ROOT) as temp:
        root = pathlib.Path(temp)
        repo = REPO
        if archive:
            file = pathlib.Path(archive).resolve()
            if not file.is_relative_to((ROOT/'incoming').resolve()):
                raise RuntimeError('Restore test accepts only the private incoming directory')
            with tarfile.open(file) as source:
                source.extractall(root/'external', filter='data')
            repo = root/'external/repository'
        restic('check','--read-data',repo=repo)
        restored = root/'restored'
        restic('restore','latest','--tag','hotel-admin','--target',str(restored),repo=repo)
        payload = restored/str(PAYLOAD).lstrip('/')
        manifest = verify_payload(payload)
        # Boot the recovered release on localhost with a separate database and
        # no SMTP credentials. No public proxy, synthetic users or real mutations.
        app = payload/'app'
        if digest(app/'package-lock.json') != digest(APP/'package-lock.json'):
            raise RuntimeError('Restore needs the dependencies from its own lock file')
        (app/'node_modules').symlink_to(APP/'node_modules', target_is_directory=True)
        (app/'.dev.vars').write_text('AUTH_ORIGIN="http://localhost:8791"\nAPP_ENV="test"\n')
        import urllib.request, urllib.error
        with (root/'runtime-private.log').open('w') as log:
            process = subprocess.Popen(['node','scripts/start-local.mjs'],cwd=app,
                env={**os.environ,'HOTEL_PORT':'8791'},stdout=log,stderr=log,start_new_session=True)
            try:
                for attempt in range(40):
                    try:
                        with urllib.request.urlopen('http://localhost:8791/login',timeout=2) as response:
                            assert response.status == 200
                        break
                    except (OSError, urllib.error.URLError):
                        if process.poll() is not None:
                            raise RuntimeError('Restored runtime failed to start')
                        time.sleep(1)
                else:
                    raise RuntimeError('Restored runtime timed out')
                try:
                    urllib.request.urlopen('http://localhost:8791/api/hotel',timeout=5)
                    raise RuntimeError('Restored API was not protected')
                except urllib.error.HTTPError as error:
                    assert error.code == 401
            finally:
                import signal
                os.killpg(process.pid,signal.SIGTERM)
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid,signal.SIGKILL);process.wait()
        existing = json.loads(STATUS.read_text()) if STATUS.exists() else {}
        existing.update(restore_test=now(), restore_source='PC archive' if archive else 'VPS encrypted repository',last_error=None,
                        restored_revision=manifest['revision'])
        write_json(STATUS, existing)
        print('Isolated restore passed: all file hashes, database rows, foreign keys, login and protected API.')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['init','backup','export','restore-test'])
    parser.add_argument('--archive')
    args=parser.parse_args()
    if os.geteuid()!=0: raise RuntimeError('Run as root on the VPS')
    import fcntl
    with pathlib.Path('/run/lock/hotel-backup.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:
            if args.action=='init': initialize()
            elif args.action=='backup': backup()
            elif args.action=='export': export()
            else: restore_test(args.archive)
        except Exception as error:
            if ROOT.exists():
                existing=json.loads(STATUS.read_text()) if STATUS.exists() else {}
                existing.update(last_error=type(error).__name__,failed_at=now())
                write_json(STATUS,existing)
            print('Backup operation failed; inspect the private VPS logs.',file=__import__('sys').stderr)
            raise

if __name__=='__main__': main()
