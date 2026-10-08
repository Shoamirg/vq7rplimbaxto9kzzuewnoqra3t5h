"""Real PostgreSQL16 backup/recovery rehearsal; Linux Docker + Compose required.

Only uniquely owned QA containers/volumes are used; no ports are published.
Raw archives, rows and temporary credentials are never written to evidence.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import subprocess
import tempfile
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
OWNER = 'garageos.recovery.run'
OUTPUT = None


class DatabaseRecoveryTest(unittest.TestCase):
    @classmethod
    def save_log(cls, name, text):
        for value in cls.secrets:
            text = text.replace(value, '[withheld]')
        text = re.sub(r'\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}', '[withheld hash]', text)
        (OUTPUT / (name + '.log')).write_text(text, encoding='utf-8')

    @classmethod
    def run_command(cls, args, *, cwd=None, env=None, log=None, allow_failure=False, timeout=180):
        result = subprocess.run([str(a) for a in args], cwd=cwd, env=env,
                                capture_output=True, text=True, timeout=timeout)
        if log:
            cls.save_log(log, result.stdout + result.stderr)
        if result.returncode and not allow_failure:
            cls.save_log('last-command-error', result.stderr)
            raise RuntimeError(f'{args[0]} {args[1]} failed; inspect sanitized gate log')
        return result

    @classmethod
    def docker(cls, *args, **kwargs):
        return cls.run_command(['docker', *args], **kwargs)

    @classmethod
    def inspect(cls, kind, name):
        result = cls.docker(kind, 'inspect', name, allow_failure=True)
        if result.returncode:
            if re.search(r'no such|not found', result.stderr, re.IGNORECASE):
                return None
            raise RuntimeError('Docker inspection unavailable; resource absence is unproven')
        return json.loads(result.stdout)[0]

    @classmethod
    def setUpClass(cls):
        if os.name != 'posix' or cls.docker('info', '--format', '{{.OSType}}').stdout.strip() != 'linux':
            raise RuntimeError('Run this rehearsal on Linux with Docker and Compose')
        cls.docker('compose', 'version')
        OUTPUT.mkdir(parents=True, exist_ok=True)
        cls.tag = 'garageos-recovery-' + uuid.uuid4().hex[:12]
        cls.private = Path(tempfile.mkdtemp(prefix=cls.tag + '-', dir='/tmp')).resolve()
        cls.containers, cls.script_containers, cls.script_volumes = [], {}, {}
        cls.volumes, cls.networks = [], []
        cls.secrets = [secrets.token_hex(24) for _ in range(3)]
        cls.image = 'garageos-recovery:' + cls.tag
        cls.image_created = False
        cls.addClassCleanup(cls.cleanup)
        # Docker bind mounts must be native Linux files. Packaged Windows app
        # checkout paths can be readable by WSL yet fail inside a container.
        cls.fixture = cls.private/'recovery_fixture.py'
        cls.fixture.write_bytes((ROOT/'scripts/recovery_fixture.py').read_bytes())
        cls.fixture.chmod(0o644)  # Nonsecret code must be readable by the image's app user.
        cls.source_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        production = (ROOT / 'docker-compose.prod.yml').read_text()
        cls.pg_image = re.search(r'  postgres:\n    image: ([^\n]+)', production)[1].strip()
        cls.redis_image = re.search(r'  redis:\n    image: ([^\n]+)', production)[1].strip()
        assert cls.pg_image == 'postgres:16-alpine'
        cls.environment = dict(os.environ, COMPOSE_PROJECT_NAME=cls.tag,
                               ENV_FILE=str(cls.private/'deployment settings.env'),
                               BACKUP_DIR=str(cls.private/'private backup output'), PG_IMAGE=cls.pg_image)
        values = {'POSTGRES_USER': 'recovery_role', 'POSTGRES_PASSWORD': cls.secrets[0],
                  'POSTGRES_DB': 'garageos_recovery'}
        cls.write_private(Path(cls.environment['ENV_FILE']), values)
        cls.backend_env = cls.private/'backend source.env'
        cls.write_private(cls.backend_env, {
            'DATABASE_URL': f'postgresql+asyncpg://recovery_role:{cls.secrets[0]}@postgres:5432/garageos_recovery',
            'REDIS_URL': 'redis://redis:6379/0', 'ENVIRONMENT': 'production', 'DEBUG': 'false',
            'SECRET_KEY': cls.secrets[1], 'CORS_ORIGINS': 'https://recovery.example.com',
            'WEB_CONCURRENCY': '1', 'GARAGEOS_RECOVERY_RUN': cls.tag,
            'GARAGEOS_RECOVERY_PASSWORD': cls.secrets[2]})
        cls.target_env = cls.private/'backend restored.env'
        cls.target_env.write_text(cls.backend_env.read_text().replace('@postgres:', '@restored:'))
        cls.target_env.chmod(0o600)
        labels = {OWNER: cls.tag}
        config = {'services': {
            'postgres': {'image': cls.pg_image, 'environment': {k: '${' + k + '}' for k in values},
                         'labels': labels, 'volumes': ['source_data:/var/lib/postgresql/data']},
            'redis': {'image': cls.redis_image, 'labels': labels}},
            'volumes': {'source_data': {'labels': labels}},
            'networks': {'default': {'labels': labels}}}
        (cls.private/'docker-compose.prod.yml').write_text(json.dumps(config))
        cls.network = cls.tag + '_default'
        cls.source_volume = cls.tag + '_source_data'
        cls.target_volume = cls.tag + '-restored-data'
        for kind, name in [('network', cls.network), ('volume', cls.source_volume),
                           ('volume', cls.target_volume), ('image', cls.image)]:
            if cls.inspect(kind, name):
                raise RuntimeError('Refusing to adopt an existing rehearsal resource')
        cls.image_created = True
        cls.docker('build', '--label', OWNER + '=' + cls.tag,
                   '--label', 'org.opencontainers.image.revision=' + cls.source_sha,
                   '-f', ROOT/'docker/Dockerfile.backend.prod', '-t', cls.image,
                   ROOT/'backend', log='backend-build', timeout=600)
        cls.volumes.append(cls.source_volume)
        cls.networks.append(cls.network)
        cls.run_command(['docker', 'compose', '-f', 'docker-compose.prod.yml', '--env-file',
                         cls.environment['ENV_FILE'], 'up', '-d'], cwd=cls.private,
                        env=cls.environment, log='source-start')
        for service in ('postgres', 'redis'):
            identifier = cls.run_command(['docker', 'compose', '-f', 'docker-compose.prod.yml',
                                          '--env-file', cls.environment['ENV_FILE'], 'ps', '-q', service],
                                         cwd=cls.private, env=cls.environment).stdout.strip()
            info = cls.inspect('container', identifier)
            assert info and info['Config']['Labels'].get(OWNER) == cls.tag
            cls.containers.append(info['Name'].lstrip('/'))
            if service == 'postgres':
                cls.source = info['Name'].lstrip('/')
        cls.ready(cls.source)
        cls.backend('migrate', cls.backend_env, ['alembic', 'upgrade', 'head'])
        cls.backend('schema', cls.backend_env, ['alembic', 'check'])
        cls.backend('seed', cls.backend_env, ['python', '/recovery_fixture.py', 'seed'])
        cls.source_backend = cls.start_backend('source', cls.backend_env)
        cls.before_api = cls.api_probe(cls.source_backend, 'source-api')
        cls.docker('rm', '-f', cls.source_backend)
        cls.before = cls.snapshot(cls.source)
        cls.docker('restart', cls.source, log='source-restart')
        cls.ready(cls.source)
        assert cls.snapshot(cls.source) == cls.before, 'Database restart changed stored records/schema'
        version = cls.query(cls.source, 'SHOW server_version;')
        assert version.startswith('16.')
        cls.identities = {'source_sha': cls.source_sha, 'backend_image_id': cls.inspect('image', cls.image)['Id'],
                          'fixture_sha256': hashlib.sha256(cls.fixture.read_bytes()).hexdigest(),
                          'postgres_image_id': cls.inspect('image', cls.pg_image)['Id'],
                          'postgres_version': version, 'role': 'recovery_role',
                          'source_restart_preserved': True}

    @classmethod
    def write_private(cls, path, values):
        path.write_text(''.join(k + '=' + v + '\n' for k, v in values.items()))
        path.chmod(0o600)

    @classmethod
    def ready(cls, container):
        for _ in range(40):
            result = cls.docker('exec', container, 'pg_isready', '-h', '127.0.0.1',
                                '-U', 'recovery_role', '-d', 'garageos_recovery', allow_failure=True)
            if not result.returncode:
                return
            time.sleep(0.5)
        raise RuntimeError('Owned PostgreSQL readiness timed out')

    @classmethod
    def backend(cls, suffix, env_file, command):
        name = cls.tag + '-' + suffix
        cls.containers.append(name)
        return cls.docker('run', '--rm', '--name', name, '--label', OWNER + '=' + cls.tag,
                          '--network', cls.network, '--env-file', env_file, '--mount',
                          f'type=bind,src={cls.fixture},dst=/recovery_fixture.py,readonly',
                          cls.image, *command, log=suffix, timeout=180)

    @classmethod
    def start_backend(cls, suffix, env_file):
        name = cls.tag + '-api-' + suffix
        cls.containers.append(name)
        cls.docker('run', '-d', '--name', name, '--label', OWNER + '=' + cls.tag,
                   '--network', cls.network, '--env-file', env_file, '--mount',
                   f'type=bind,src={cls.fixture},dst=/recovery_fixture.py,readonly', cls.image)
        for _ in range(60):
            result = cls.docker('exec', name, 'curl', '-fsS', 'http://127.0.0.1:8000/health', allow_failure=True)
            if not result.returncode:
                return name
            if not cls.inspect('container', name)['State']['Running']:
                cls.docker('logs', name, log=suffix + '-startup')
                raise RuntimeError('Owned production backend exited')
            time.sleep(0.5)
        cls.docker('logs', name, log=suffix + '-startup')
        raise RuntimeError('Owned production backend readiness timed out')

    @classmethod
    def api_probe(cls, name, log):
        result = cls.docker('exec', name, 'python', '/recovery_fixture.py', 'probe', log=log)
        return json.loads(result.stdout)

    @classmethod
    def query(cls, container, sql):
        return cls.docker('exec', container, 'psql', '-X', '-tA', '-v', 'ON_ERROR_STOP=1',
                          '-U', 'recovery_role', '-d', 'garageos_recovery', '-c', sql).stdout.strip()

    @classmethod
    def snapshot(cls, container):
        def quoted(name):
            return '"' + name.replace('"', '""') + '"'

        tables = cls.query(container, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").splitlines()
        rows = {}
        for table in tables:
            data = json.loads(cls.query(container, f"SELECT coalesce(json_agg(t ORDER BY row_to_json(t)::text),'[]'::json) FROM public.{quoted(table)} t;"))
            rows[table] = {'rows': len(data), 'sha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
        schema = cls.docker('exec', container, 'pg_dump', '--schema-only',
                            '-U', 'recovery_role', 'garageos_recovery').stdout
        # Patched pg_dump adds a fresh \restrict nonce; comments carry tool metadata.
        normalized = '\n'.join(line for line in schema.splitlines()
                               if line and not line.startswith(('--', '\\restrict ', '\\unrestrict ')))
        sequences = {}
        for name in cls.query(container, "SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;").splitlines():
            sequences[name] = cls.query(container, f'SELECT last_value,is_called FROM public.{quoted(name)};')
        return {'tables': rows, 'schema_sha256': hashlib.sha256(normalized.encode()).hexdigest(),
                'sequences': sequences, 'alembic_revision': cls.query(container, 'SELECT version_num FROM alembic_version;')}

    def restore_script(self, archive, name, expected_success):
        container_name = self.tag + '-script-' + name
        self.assertIsNone(self.inspect('container', container_name), 'Refusing an existing script container')
        environment = dict(self.environment, RESTORE_TEST_CONTAINER=container_name)
        process = subprocess.Popen(['bash', str(ROOT/'scripts/restore-test.sh'), str(archive)],
                                   cwd=self.private, env=environment,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                   start_new_session=True)
        deadline = time.monotonic() + 90
        try:
            while process.poll() is None:
                info = self.inspect('container', container_name)
                if info:
                    self.assertEqual(info['Config']['Labels'].get('garageos.restore-test.run'), container_name)
                    assert 'POSTGRES_DB=restore_verify' in info['Config']['Env']
                    self.script_containers[container_name] = info['Id']
                    for mount in info['Mounts']:
                        if mount['Type'] == 'volume':
                            volume = self.inspect('volume', mount['Name'])
                            if volume:  # Script cleanup can happen between inspections.
                                self.script_volumes[mount['Name']] = volume['CreatedAt']
                if time.monotonic() > deadline:
                    raise RuntimeError('Restore script timed out')
                time.sleep(0.2)
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)  # Dedicated owned session, not shared shell.
            try:
                stdout, stderr = process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                stdout, stderr = process.communicate(timeout=10)
            self.save_log(name, stdout + stderr)
            raise
        stdout, stderr = process.communicate()
        text = stdout + stderr
        self.save_log(name, text)
        self.assertEqual(process.returncode == 0, expected_success, 'Inspect sanitized restore log')
        self.assertIsNone(self.inspect('container', container_name), 'Restore left its temporary container')
        for volume_name in self.script_volumes:
            self.assertIsNone(self.inspect('volume', volume_name), 'Restore left its anonymous database volume')
        return text

    def test_01_backup_restart_restore_and_credentials(self):
        self.run_command(['bash', ROOT/'scripts/backup.sh'], cwd=self.private, env=self.environment, log='actual-backup')
        backup_dir = Path(self.environment['BACKUP_DIR'])
        archives = list(backup_dir.glob('garageos-*.sql.gz'))
        self.assertEqual(len(archives), 1)
        archive = archives[0]
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        self.assertTrue(gzip.decompress(archive.read_bytes()))
        self.assertFalse(list(backup_dir.glob('.garageos-backup.*')))
        self.assertIn('[restore-test] PASS', self.restore_script(archive, 'actual-restore', True))
        self.volumes.append(self.target_volume)
        self.docker('volume', 'create', '--label', OWNER + '=' + self.tag, self.target_volume)
        target = self.tag + '-restored'
        self.containers.append(target)
        self.docker('run', '-d', '--name', target, '--label', OWNER + '=' + self.tag,
                    '--network', self.network, '--network-alias', 'restored', '--env-file', self.environment['ENV_FILE'],
                    '-v', self.target_volume + ':/var/lib/postgresql/data', self.pg_image)
        self.ready(target)
        restored = subprocess.run(['docker', 'exec', '-i', target, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
                                    '-U', 'recovery_role', '-d', 'garageos_recovery'],
                                   input=gzip.decompress(archive.read_bytes()), capture_output=True, timeout=60)
        self.assertEqual(restored.returncode, 0, 'Independent real SQL restore failed')
        after = self.snapshot(target)
        self.assertEqual(after, self.before, 'Restored table/schema/sequence digests differ')
        required = ('service_centers', 'users', 'customer_accounts', 'customers', 'vehicles',
                    'appointments', 'service_records', 'invoices', 'invoice_line_items', 'invoice_payments', 'ledger_entries')
        self.assertTrue(all(after['tables'][table]['rows'] >= 2 for table in required))
        backend = self.start_backend('restored', self.target_env)
        after_api = self.api_probe(backend, 'restored-api')
        self.assertEqual(after_api, self.before_api, 'Restored authentication/financial/history behavior differs')
        self.report = {**self.identities, 'snapshot': after, 'api': after_api,
                       'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                       'archive_bytes': archive.stat().st_size, 'archive_mode': '0600',
                       'qa_only': True, 'client_environment_verified': False}
        (OUTPUT/'database-recovery-summary.json').write_text(json.dumps(self.report, indent=2))

    def test_02_corrupt_gzip_rejected_without_container(self):
        archive = self.private/'corrupt.sql.gz'
        archive.write_bytes(b'not a gzip archive')
        text = self.restore_script(archive, 'corrupt-gzip', False)
        self.assertIn('no container was started', text)
        self.assertNotIn('starting throwaway', text)

    def test_03_sql_restore_failure_cleans_container_and_volume(self):
        archive = self.private/'invalid-sql.sql.gz'
        archive.write_bytes(gzip.compress(b'SELECT FROM invalid recovery SQL;\n'))
        text = self.restore_script(archive, 'invalid-sql', False)
        self.assertIn('psql restore reported errors', text)

    def test_04_name_collision_preserves_existing_container_and_volume(self):
        name = self.tag + '-collision-canary'
        self.assertIsNone(self.inspect('container', name))
        self.containers.append(name)
        identifier = self.docker('run', '-d', '--name', name, '--label', OWNER + '=' + self.tag,
                                 '-v', '/canary', 'python:3.12-alpine', 'sleep', '120').stdout.strip()
        original = self.inspect('container', identifier)
        volumes = [mount['Name'] for mount in original['Mounts'] if mount['Type'] == 'volume']
        self.assertTrue(volumes)
        archive = self.private/'collision.sql.gz'
        archive.write_bytes(gzip.compress(b'SELECT 1;\n'))
        result = self.run_command(['bash', ROOT/'scripts/restore-test.sh', archive], cwd=self.private,
                                  env=dict(self.environment, RESTORE_TEST_CONTAINER=name),
                                  log='name-collision', allow_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('name already exists', result.stderr)
        self.assertEqual(self.inspect('container', name)['Id'], identifier)
        self.assertTrue(all(self.inspect('volume', volume) for volume in volumes))
        (OUTPUT/'name-collision.json').write_text(json.dumps({
            'rejected': True, 'existing_container_preserved': True,
            'existing_anonymous_volume_preserved': True}))
        self.docker('rm', '-fv', identifier)
        self.assertTrue(all(self.inspect('volume', volume) is None for volume in volumes))

    @classmethod
    def cleanup(cls):
        try:
            # Compose can fail after creating a subset of its labeled resources.
            discovered = cls.docker('ps', '-aq', '--filter', 'label=' + OWNER + '=' + cls.tag).stdout.splitlines()
            for name in dict.fromkeys([*reversed(cls.containers), *discovered]):
                info = cls.inspect('container', name)
                if info:
                    if info['Config']['Labels'].get(OWNER) != cls.tag:
                        raise RuntimeError('Refusing cleanup of an unowned container')
                    cls.docker('rm', '-fv', name)
            for name, identifier in cls.script_containers.items():
                info = cls.inspect('container', name)
                if info:
                    if info['Id'] != identifier:
                        raise RuntimeError('Restore container identity changed')
                    cls.docker('rm', '-fv', name)
            for name, created in cls.script_volumes.items():
                info = cls.inspect('volume', name)
                if info:
                    if info['CreatedAt'] != created:
                        raise RuntimeError('Restore volume identity changed')
                    cls.docker('volume', 'rm', name)
            for kind, names in [('volume', cls.volumes), ('network', cls.networks)]:
                for name in names:
                    info = cls.inspect(kind, name)
                    if info:
                        if info.get('Labels', {}).get(OWNER) != cls.tag:
                            raise RuntimeError('Refusing cleanup of an unowned ' + kind)
                        cls.docker(kind, 'rm', name)
            if cls.image_created:
                info = cls.inspect('image', cls.image)
                if info and info['Config']['Labels'].get(OWNER) == cls.tag:
                    cls.docker('image', 'rm', cls.image)
                elif info:
                    raise RuntimeError('Recovery image identity changed')
        finally:
            if cls.private.parent != Path('/tmp') or not cls.private.name.startswith(cls.tag + '-'):
                raise RuntimeError('Refusing private fixture cleanup outside owned /tmp directory')
            shutil.rmtree(cls.private)
        (OUTPUT/'cleanup.json').write_text(json.dumps({'run': cls.tag, 'owned_resources_removed': True,
                                                      'private_fixtures_removed': not cls.private.exists()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.cwd()/'ci-evidence/database-recovery')
    args = parser.parse_args()
    OUTPUT = args.output.resolve()
    program = unittest.main(argv=[__file__], verbosity=2, exit=False)
    result = program.result
    (OUTPUT/'suite-result.json').write_text(json.dumps({
        'tests_run': result.testsRun, 'successful': result.wasSuccessful(),
        'failures': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped)}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
