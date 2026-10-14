"""Real PostgreSQL16 backup/recovery rehearsal; Linux Docker + Compose required.

Only uniquely owned QA containers/volumes are used; no ports are published.
Raw archives, rows and temporary credentials are never written to evidence.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
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


def row_sha256(row):
    return hashlib.sha256(json.dumps(row, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def summarize_auth_sessions(rows, identities, now):
    """Bind the probe's three auth flows; retain only full-row hashes/proofs."""
    def identity(name):
        return str(uuid.uuid5(uuid.NAMESPACE_URL, 'garageos/recovery/' + name))

    indexed = {table: {row['id']: row for row in data} for table, data in identities.items()}
    center_id = identity('center-a')
    center = indexed['service_centers'].get(center_id, {})
    staff = indexed['users'].get(identity('user-a'), {})
    role = indexed['roles'].get(staff.get('role_id'), {})
    customer = indexed['customers'].get(identity('customer-a'), {})
    account = indexed['customer_accounts'].get(identity('account-a'), {})
    enabled_center = center.get('is_active') is True
    enabled_staff = (staff.get('email') == 'recovery-staff-a@example.com'
        and staff.get('service_center_id') == center_id and staff.get('is_active') is True
        and staff.get('is_super_admin') is False and role.get('name') == 'admin'
        and role.get('is_active') is True)
    enabled_customer = (customer.get('service_center_id') == center_id and customer.get('is_active') is True)
    enabled_account = (account.get('email') == 'recovery-customer-a@example.com'
        and account.get('customer_id') == identity('customer-a') and account.get('service_center_id') == center_id
        and account.get('is_active') is True and account.get('version') == 7)
    linked_telegram = customer.get('telegram_id') == uuid.UUID(identity('telegram-a')).int % 10**12
    summaries = {}
    for row in rows:
        try:
            uuid.UUID(row['id'])
            created = datetime.fromisoformat(row['created_at'])
            expires = datetime.fromisoformat(row['expires_at'])
            # created_at is PostgreSQL's transaction clock, before bounded
            # password/locking work preceding application login expiry.
            valid_lifetime = (created.tzinfo is not None and expires.tzinfo is not None
                and created <= now < expires and timedelta(days=7) <= expires - created <= timedelta(days=7, seconds=60))
        except (ValueError, TypeError, KeyError):
            valid_lifetime = False
        common = (enabled_center and row.get('service_center_id') == center_id
            and row.get('demo') is False and row.get('revoked_at') is None and valid_lifetime
            and isinstance(row.get('refresh_digest'), str)
            and re.fullmatch(r'[0-9a-f]{64}', row['refresh_digest']) is not None)
        is_staff = (common and enabled_staff and row.get('principal_kind') == 'staff'
            and row.get('user_id') == identity('user-a') and row.get('customer_id') is None
            and row.get('customer_account_id') is None and row.get('account_version') is None)
        is_customer = (common and enabled_customer and row.get('principal_kind') == 'customer'
            and row.get('customer_id') == identity('customer-a') and row.get('user_id') is None)
        is_password = (is_customer and enabled_account and row.get('customer_account_id') == identity('account-a')
            and type(row.get('account_version')) is int and row['account_version'] == 7)
        is_telegram = (is_customer and linked_telegram and row.get('customer_account_id') is None
            and row.get('account_version') is None)
        summaries[row['id']] = {'sha256': row_sha256(row), 'expected_fresh_staff_login': bool(is_staff),
            'expected_fresh_customer_password_login': bool(is_password),
            'expected_fresh_customer_telegram_login': bool(is_telegram)}
    return summaries


class ProbeEffectsContractTest(unittest.TestCase):
    """Pure validator regressions; no Docker, database, credentials or API."""

    def setUp(self):
        self.now = datetime(2026, 10, 13, tzinfo=timezone.utc)
        def key(name):
            return str(uuid.uuid5(uuid.NAMESPACE_URL, 'garageos/recovery/' + name))
        self.key = key
        self.identities = {
            'service_centers': [{'id': key('center-a'), 'is_active': True}],
            'roles': [{'id': key('role'), 'name': 'admin', 'is_active': True}],
            'users': [{'id': key('user-a'), 'email': 'recovery-staff-a@example.com',
                       'service_center_id': key('center-a'), 'role_id': key('role'),
                       'is_active': True, 'is_super_admin': False}],
            'customers': [{'id': key('customer-a'), 'service_center_id': key('center-a'),
                           'telegram_id': uuid.UUID(key('telegram-a')).int % 10**12, 'is_active': True}],
            'customer_accounts': [{'id': key('account-a'), 'customer_id': key('customer-a'),
                                   'service_center_id': key('center-a'), 'version': 7,
                                   'email': 'recovery-customer-a@example.com', 'is_active': True}],
        }
        base = {'id': key('new-staff-session'), 'principal_kind': 'staff',
                'user_id': key('user-a'), 'customer_id': None,
                'service_center_id': key('center-a'), 'customer_account_id': None,
                'account_version': None, 'demo': False,
                'refresh_digest': hashlib.sha256(b'synthetic non-credential').hexdigest(),
                'created_at': (self.now - timedelta(seconds=5)).isoformat(),
                'expires_at': (self.now + timedelta(days=7, seconds=-5)).isoformat(), 'revoked_at': None}
        self.fresh = [base,
            dict(base, id=key('new-password-session'), principal_kind='customer', user_id=None,
                 customer_id=key('customer-a'), customer_account_id=key('account-a'), account_version=7),
            dict(base, id=key('new-telegram-session'), principal_kind='customer', user_id=None,
                 customer_id=key('customer-a'))]
        self.old = [dict(base, id=key('old-active-session')),
                    dict(base, id=key('old-revoked-session'), revoked_at=self.now.isoformat()),
                    dict(base, id=key('old-expired-session'),
                         created_at=(self.now - timedelta(days=8)).isoformat(),
                         expires_at=(self.now - timedelta(days=1)).isoformat())]

    def snapshot(self, sessions, *, audits=1):
        summaries = summarize_auth_sessions(sessions, self.identities, self.now)
        return {'tables': {'auth_sessions': {'rows': len(sessions), 'sha256': row_sha256(sessions)},
                           'audit_logs': {'rows': audits, 'sha256': str(audits)},
                           'invoices': {'rows': 2, 'sha256': 'unchanged'}},
                'session_rows': summaries,
                'audit_rows': {str(i): {'sha256': str(i), 'expected_login': True} for i in range(audits)},
                'schema_sha256': 'same-schema', 'sequences': {'retained': '4|t'}, 'alembic_revision': 'same'}

    def test_exact_three_bound_families_and_one_audit_are_allowed(self):
        before = self.snapshot(self.old)
        after = self.snapshot(self.old + self.fresh, audits=2)
        DatabaseRecoveryTest.assert_probe_effects(before, after)

    def test_changing_or_removing_an_existing_family_is_rejected(self):
        before = self.snapshot(self.old)
        for field, value in [('refresh_digest', 'f' * 64), ('revoked_at', self.now.isoformat()),
                             ('expires_at', (self.now + timedelta(days=2)).isoformat())]:
            with self.subTest(field=field):
                altered = deepcopy(self.old)
                altered[0][field] = value
                with self.assertRaises(AssertionError):
                    DatabaseRecoveryTest.assert_probe_effects(before, self.snapshot(altered + self.fresh, audits=2))
        with self.assertRaises(AssertionError):
            DatabaseRecoveryTest.assert_probe_effects(before, self.snapshot(self.old[1:] + self.fresh, audits=2))

    def test_wrong_owner_account_flags_or_malformed_digest_are_rejected(self):
        before = self.snapshot(self.old)
        for index, field, value in [(0, 'user_id', self.key('user-b')),
                (0, 'service_center_id', self.key('center-b')), (0, 'demo', True),
                (1, 'customer_id', self.key('customer-b')), (1, 'customer_account_id', self.key('account-b')),
                (1, 'account_version', 8), (2, 'customer_account_id', self.key('account-a')),
                (0, 'revoked_at', self.now.isoformat()), (0, 'refresh_digest', 'not-a-digest'),
                (0, 'expires_at', (self.now - timedelta(seconds=1)).isoformat()),
                (0, 'expires_at', (self.now + timedelta(days=8)).isoformat()),
                (0, 'created_at', (self.now + timedelta(seconds=1)).isoformat())]:
            with self.subTest(index=index, field=field):
                fresh = deepcopy(self.fresh)
                fresh[index][field] = value
                with self.assertRaises(AssertionError):
                    DatabaseRecoveryTest.assert_probe_effects(before, self.snapshot(self.old + fresh, audits=2))

    def test_extra_missing_or_duplicate_family_kind_is_rejected(self):
        before = self.snapshot(self.old)
        extra = dict(self.fresh[0], id=self.key('unexpected-extra-session'))
        duplicated_kind = dict(self.fresh[0], id=self.fresh[2]['id'])
        for fresh in [self.fresh + [extra], self.fresh[:2], self.fresh[:2] + [duplicated_kind]]:
            with self.assertRaises(AssertionError):
                DatabaseRecoveryTest.assert_probe_effects(before, self.snapshot(self.old + fresh, audits=2))

    def test_other_table_schema_sequence_or_audit_mutations_are_rejected(self):
        before = self.snapshot(self.old)
        good = self.snapshot(self.old + self.fresh, audits=2)
        for field, value in [('schema_sha256', 'changed'), ('sequences', {'retained': '5|t'}),
                             ('alembic_revision', 'changed')]:
            with self.subTest(field=field):
                after = deepcopy(good)
                after[field] = value
                with self.assertRaises(AssertionError):
                    DatabaseRecoveryTest.assert_probe_effects(before, after)
        for mutation in ('business', 'audit', 'row-count'):
            after = deepcopy(good)
            if mutation == 'business': after['tables']['invoices']['sha256'] = 'changed'
            elif mutation == 'audit': after['audit_rows']['0']['sha256'] = 'changed'
            else: after['tables']['auth_sessions']['rows'] += 1
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                DatabaseRecoveryTest.assert_probe_effects(before, after)

    def test_session_evidence_contains_only_full_row_hash_and_boolean_proofs(self):
        summary = summarize_auth_sessions(self.fresh, self.identities, self.now)
        for row in summary.values():
            self.assertEqual(set(row), {'sha256', 'expected_fresh_staff_login',
                'expected_fresh_customer_password_login', 'expected_fresh_customer_telegram_login'})
            self.assertNotIn('refresh_digest', row)


class DatabaseRecoveryTest(unittest.TestCase):
    dockerfile = ROOT/'docker/Dockerfile.backend.prod'
    backend_path = ROOT/'backend'
    source_root = ROOT
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
        cls.secrets = [secrets.token_hex(24) for _ in range(4)]
        cls.image = 'garageos-recovery:' + cls.tag
        cls.image_created = False
        cls.addClassCleanup(cls.cleanup)
        # Docker bind mounts must be native Linux files. Packaged Windows app
        # checkout paths can be readable by WSL yet fail inside a container.
        cls.fixture = cls.private/'recovery_fixture.py'
        cls.fixture.write_bytes((ROOT/'scripts/recovery_fixture.py').read_bytes())
        cls.fixture.chmod(0o644)  # Nonsecret code must be readable by the image's app user.
        cls.source_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=cls.source_root, text=True).strip()
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
            'REFRESH_TOKEN_EXPIRE_DAYS': '7',
            'WEB_CONCURRENCY': '1', 'GARAGEOS_RECOVERY_RUN': cls.tag,
            'GARAGEOS_RECOVERY_PASSWORD': cls.secrets[2], 'TELEGRAM_BOT_TOKEN': cls.secrets[3]})
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
                   '-f', cls.dockerfile, '-t', cls.image,
                   cls.backend_path, log='backend-build', timeout=600)
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
        # A genuinely new API process must replay the original database receipts
        # before the subsequent database-restart and backup/restore checks.
        cls.docker('rm', '-f', cls.source_backend)
        cls.before = cls.snapshot(cls.source)
        restart_backend = cls.start_backend('restarted-api', cls.backend_env)
        cls.api_after_restart = cls.api_probe(restart_backend, 'restarted-api')
        assert cls.api_after_restart == cls.before_api, 'API restart changed acknowledged message receipts'
        cls.docker('rm', '-f', restart_backend)
        after_restart = cls.snapshot(cls.source)
        (OUTPUT/'api-restart-digests.json').write_text(json.dumps({
            'before': cls.before, 'after': after_restart,
            'changed_tables': [name for name in cls.before['tables'] if cls.before['tables'][name] != after_restart['tables'][name]],
        }, indent=2))
        cls.assert_probe_effects(cls.before, after_restart)
        cls.before = after_restart  # Verified login audit and three fresh token families.
        cls.docker('restart', cls.source, log='source-restart')
        cls.ready(cls.source)
        assert cls.snapshot(cls.source) == cls.before, 'Database restart changed stored records/schema'
        version = cls.query(cls.source, 'SHOW server_version;')
        assert version.startswith('16.')
        cls.identities = {'source_sha': cls.source_sha, 'backend_image_id': cls.inspect('image', cls.image)['Id'],
                          'fixture_sha256': hashlib.sha256(cls.fixture.read_bytes()).hexdigest(),
                          'postgres_image_id': cls.inspect('image', cls.pg_image)['Id'],
                          'postgres_version': version, 'role': 'recovery_role',
                          'source_restart_preserved': True, 'api_restart_message_receipts_preserved': True}

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
        audits = {}
        identities = {}
        session_data = []
        for table in tables:
            data = json.loads(cls.query(container, f"SELECT coalesce(json_agg(t ORDER BY row_to_json(t)::text),'[]'::json) FROM public.{quoted(table)} t;"))
            rows[table] = {'rows': len(data), 'sha256': row_sha256(data)}
            if table in {'users', 'customers', 'customer_accounts', 'roles', 'service_centers'}:
                identities[table] = data
            if table == 'auth_sessions':
                session_data = data
            if table == 'audit_logs':
                for row in data:
                    audits[row['id']] = {
                        'sha256': row_sha256(row),
                        'expected_login': (row['action'] == 'auth.login.success' and row['status'] == 'success'
                                           and row['actor_email'] == 'recovery-staff-a@example.com'
                                           and row['service_center_id'] is None and row['actor_user_id'] is None
                                           and row['resource_type'] is None and row['resource_id'] is None
                                           and row['context'] is None),
                    }
        schema = cls.docker('exec', container, 'pg_dump', '--schema-only',
                            '-U', 'recovery_role', 'garageos_recovery').stdout
        # Patched pg_dump adds a fresh \restrict nonce; comments carry tool metadata.
        normalized = '\n'.join(line for line in schema.splitlines()
                               if line and not line.startswith(('--', '\\restrict ', '\\unrestrict ')))
        schema_hash = hashlib.sha256(normalized.encode()).hexdigest()
        # Schema-only evidence diagnoses genuine restore differences without
        # retaining database rows, credentials or the private SQL backup.
        (OUTPUT / ('schema-' + schema_hash + '.sql')).write_text(normalized)
        sequences = {}
        for name in cls.query(container, "SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;").splitlines():
            sequences[name] = cls.query(container, f'SELECT last_value,is_called FROM public.{quoted(name)};')
        sessions = summarize_auth_sessions(session_data, identities, datetime.now(timezone.utc))
        return {'tables': rows, 'audit_rows': audits, 'session_rows': sessions, 'schema_sha256': schema_hash,
                'sequences': sequences, 'alembic_revision': cls.query(container, 'SELECT version_num FROM alembic_version;')}

    @classmethod
    def assert_probe_effects(cls, before, after):
        # Probe does exactly staff/password-customer/Telegram sign-ins. Prove
        # their precise append-only effects, including every retained family.
        for field in ('schema_sha256', 'sequences', 'alembic_revision'):
            assert after[field] == before[field], field
        assert set(before['tables']) == set(after['tables'])
        for name in before['tables']:
            if name not in {'audit_logs', 'auth_sessions'}:
                assert before['tables'][name] == after['tables'][name], name
        assert before['audit_rows'].keys() <= after['audit_rows'].keys()
        for key, row in before['audit_rows'].items():
            assert row == after['audit_rows'][key], 'Existing audit row changed'
        added = after['audit_rows'].keys() - before['audit_rows'].keys()
        assert len(added) == 1 and all(after['audit_rows'][key]['expected_login'] for key in added)
        assert after['tables']['audit_logs']['rows'] == before['tables']['audit_logs']['rows'] + 1
        assert before['session_rows'].keys() <= after['session_rows'].keys(), 'Existing session removed'
        for key, row in before['session_rows'].items():
            assert row == after['session_rows'][key], 'Existing session row changed'
        added_sessions = after['session_rows'].keys() - before['session_rows'].keys()
        assert len(added_sessions) == 3, 'Probe must append exactly three bound sessions'
        proofs = ('expected_fresh_staff_login', 'expected_fresh_customer_password_login',
                  'expected_fresh_customer_telegram_login')
        assert all(sum(after['session_rows'][key][proof] for proof in proofs) == 1
                   for key in added_sessions), 'Each new session must match exactly one probe flow'
        for proof in proofs:
            assert sum(after['session_rows'][key][proof] for key in added_sessions) == 1, proof
        for snapshot in (before, after):
            assert snapshot['tables']['auth_sessions']['rows'] == len(snapshot['session_rows']), 'Session snapshot incomplete'
        assert after['tables']['auth_sessions']['rows'] == before['tables']['auth_sessions']['rows'] + 3

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
        (OUTPUT/'source-restore-digests.json').write_text(json.dumps({'source': self.before, 'restored': after}, indent=2))
        self.assertEqual(after, self.before, 'Restored table/schema/sequence digests differ')
        required = ('service_centers', 'users', 'customer_accounts', 'customers', 'vehicles',
                    'appointments', 'service_records', 'invoices', 'invoice_line_items', 'invoice_payments', 'ledger_entries',
                    'conversations', 'conversation_messages', 'message_intents')
        self.assertTrue(all(after['tables'][table]['rows'] >= 2 for table in required))
        self.assertEqual(after['tables']['conversation_attachments']['rows'], 1)
        backend = self.start_backend('restored', self.target_env)
        after_api = self.api_probe(backend, 'restored-api')
        self.assertEqual(after_api, self.before_api, 'Restored authentication/financial/history behavior differs')
        post_probe = self.snapshot(target)
        self.assert_probe_effects(self.before, post_probe)
        self.report = {**self.identities, 'snapshot': after, 'api': after_api,
                       'post_restore_probe_snapshot': post_probe, 'fresh_probe_login_audit_verified': True,
                       'fresh_probe_auth_sessions_verified': ['staff', 'customer_password', 'customer_telegram'],
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
