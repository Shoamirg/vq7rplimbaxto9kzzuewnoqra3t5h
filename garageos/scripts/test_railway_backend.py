"""Rehearse the Railway Docker image privately with real PostgreSQL and Redis."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
from textwrap import indent
import unittest

import test_database_recovery as recovery

OUTPUT = None
APP = recovery.ROOT/'backend'
PORT = 8087
PROBE = r"""import json, os, sys
from pathlib import Path
import httpx
base = 'http://127.0.0.1:8087'
action = sys.argv[1]
with httpx.Client(base_url=base, timeout=10) as client:
    if action == 'runtime':
        ready = client.get('/ready')
        login = client.post('/api/v1/auth/login', json={'email':'recovery-staff-a@example.com',
                         'password':os.environ['GARAGEOS_RECOVERY_PASSWORD']})
        token = login.json().get('access_token')
        profile = client.get('/api/v1/auth/me', headers={'Authorization':'Bearer ' + (token or '')})
        cors = client.options('/api/v1/auth/login', headers={'Origin':'https://recovery.example.com',
                    'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'})
        foreign = client.options('/api/v1/auth/login', headers={'Origin':'https://foreign.example.com',
                    'Access-Control-Request-Method':'POST'})
        result = {'ready':ready.status_code == 200 and ready.json()['status'] == 'ready',
                  'login':login.status_code, 'profile':profile.status_code,
                  'cors':cors.status_code == 200 and cors.headers.get('access-control-allow-origin') == 'https://recovery.example.com',
                  'foreign_origin_denied':foreign.status_code == 400,
                  'private_files_absent':all(not Path('/app', x).exists() for x in ('.env','tests','requirements-dev.txt')),
                  'reference_catalog_present':Path('/app/data/brands.json').is_file(),
                  'nonroot':os.getuid() != 0,
                  'pid1_uvicorn':any(Path(arg.decode()).name == 'uvicorn' for arg in Path('/proc/1/cmdline').read_bytes().split(b'\0')[:2])}
    elif action == 'quota':
        replies = [client.post('/api/v1/auth/login', headers={'X-Real-IP':'198.51.100.17',
                    'X-Forwarded-For':'203.0.113.' + str(i)}, json={
                    'email':'recovery-staff-a@example.com','password':'incorrect-qa-password'}) for i in range(6)]
        result = {'statuses':[r.status_code for r in replies],
                  'retry_after':all(r.headers.get('retry-after','').isdecimal() and 0 < int(r.headers['retry-after']) <= 300 for r in replies[4:]),
                  'no_cookies':all('set-cookie' not in r.headers for r in replies)}
    else:
        response = client.get('/ready')
        data = response.json()
        checks = data.get('checks', {})
        result = {'status':response.status_code, 'not_ready':data.get('status') == 'not_ready'}
        for dependency in ('database', 'redis'):
            check = checks.get(dependency, {})
            result[dependency + '_ok'] = check.get('ok') is True
            result[dependency + '_unavailable'] = check.get('ok') is False and check.get('error') == 'unavailable'
print(json.dumps(result))
"""
SAFE_PROBE = "try:\n" + indent(PROBE, '    ') + "\nexcept Exception:\n    print('{\"probe_failed\":true}')\n"

PRIVACY_HARNESS = r"""import json, sys
from contextlib import nullcontext
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
from test_railway_backend import SAFE_PROBE
mode = sys.argv[2]
class Client:
    def get(self, path):
        if mode == 'exception':
            raise RuntimeError('private-qa-dependency-detail')
        return SimpleNamespace(status_code=503, json=lambda: {'status':'not_ready',
            'checks':{key:{'ok':False,'error':'private-qa-dependency-detail'} for key in ('database','redis')}})
sys.modules['httpx'] = SimpleNamespace(Client=lambda **kwargs: nullcontext(Client()))
sys.argv = ['private-probe', 'ready']
exec(SAFE_PROBE)
"""


class RailwayProbePrivacyTest(unittest.TestCase):
    def check_probe(self, mode):
        result = subprocess.run([sys.executable, '-c', PRIVACY_HARNESS,
                                 str(Path(__file__).parent), mode], capture_output=True,
                                text=True, timeout=30)
        self.assertNotIn('private-qa-dependency-detail', result.stdout + result.stderr)
        self.assertEqual(result.returncode, 0)
        return json.loads(result.stdout)

    def test_private_readiness_body_is_reduced_to_boolean_proofs(self):
        proof = self.check_probe('body')
        self.assertEqual(proof, {'status':503, 'not_ready':True, 'database_ok':False,
                               'database_unavailable':False, 'redis_ok':False, 'redis_unavailable':False})

    def test_probe_exception_is_sanitized_before_crossing_container_boundary(self):
        self.assertEqual(self.check_probe('exception'), {'probe_failed':True})


class RailwayBackendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Fixture(recovery.DatabaseRecoveryTest):
            dockerfile = APP/'Dockerfile'
            backend_path = APP
            source_root = APP

            @classmethod
            def write_private(qa, path, values):
                values = dict(values)
                if 'DATABASE_URL' in values:
                    password = qa.secrets[0]
                    encoded = '%' + format(ord(password[0]), '02X') + password[1:]
                    qa.secrets.append(encoded)
                    values['DATABASE_URL'] = values['DATABASE_URL'].replace(
                        'postgresql+asyncpg://', 'postgresql://').replace(password, encoded)
                    values['RATE_LIMIT_ENABLED'] = 'false'
                super().write_private(path, values)

        recovery.OUTPUT = OUTPUT
        cls.qa = Fixture
        cls.addClassCleanup(cls.cleanup)
        cls.qa.setUpClass()  # Actual pre-deploy migration, auth and data restart proofs.
        qa = cls.qa
        packages = json.loads(qa.backend('railway-packages', qa.backend_env,
                             ['python', '-m', 'pip', 'list', '--format=json']).stdout)
        OUTPUT.joinpath('runtime-requirements.txt').write_text(''.join(
            item['name'] + '==' + item['version'] + '\n' for item in packages))
        runtime_env = qa.private/'railway runtime.env'
        runtime_env.write_text(qa.backend_env.read_text() +
            '\nPORT=8087\nTRUST_PROXY_HEADERS=true\nRATE_LIMIT_ENABLED=true\n'
            'RATE_LIMIT_AUTH_MAX=4\nRATE_LIMIT_AUTH_WINDOW_SECONDS=300\n')
        runtime_env.chmod(0o600)
        cls.api = qa.tag + '-railway-port'
        qa.containers.append(cls.api)
        qa.docker('run', '-d', '--name', cls.api, '--label', recovery.OWNER + '=' + qa.tag,
                  '--network', qa.network, '--env-file', runtime_env, qa.image)
        cls.wait_ready()
        cls.proofs = {'source_sha':qa.source_sha, 'custom_port':PORT,
                      'host_ports_published':False, 'encoded_database_url_migrated':True,
                      'image_id':qa.inspect('image', qa.image)['Id']}
        assert not qa.inspect('container', cls.api)['HostConfig']['PortBindings']

    @classmethod
    def probe(cls, action):
        proof = json.loads(cls.qa.docker('exec', cls.api, 'python', '-c', SAFE_PROBE, action).stdout)
        if proof.get('probe_failed'):
            raise RuntimeError('Railway QA HTTP probe failed; private response withheld')
        return proof

    @classmethod
    def wait_ready(cls):
        for _ in range(60):
            check = cls.qa.docker('exec', cls.api, 'curl', '-fsS', f'http://127.0.0.1:{PORT}/ready', allow_failure=True)
            if not check.returncode:
                return
            if not cls.qa.inspect('container', cls.api)['State']['Running']:
                cls.qa.docker('logs', cls.api, log='railway-startup')
                raise RuntimeError('Railway QA image exited')
            time.sleep(0.5)
        raise RuntimeError('Railway QA readiness timed out')

    def test_01_custom_port_auth_cors_and_private_runtime(self):
        proof = self.probe('runtime')
        self.assertEqual(proof.pop('login'), 200)
        self.assertEqual(proof.pop('profile'), 200)
        self.assertTrue(all(value is True for value in proof.values()), proof)
        self.proofs['runtime'] = proof

    def test_02_auth_quota_uses_edge_ip_despite_changing_forwarded_chain(self):
        proof = self.probe('quota')
        self.assertEqual(proof['statuses'], [401, 401, 401, 401, 429, 429])
        self.assertTrue(proof['retry_after'] and proof['no_cookies'])
        self.proofs['quota'] = proof

    def test_03_readiness_rejects_failed_dependencies_and_recovers(self):
        qa = self.qa
        redis = next(name for name in qa.containers if qa.inspect('container', name)
                     and qa.inspect('container', name)['Config']['Image'] == qa.redis_image)
        for name, dependency in [(redis, 'redis'), (qa.source, 'database')]:
            with self.subTest(dependency=dependency):
                qa.docker('stop', name)
                try:
                    proof = self.probe('ready')
                    self.assertEqual(proof['status'], 503)
                    self.assertTrue(proof['not_ready'] and proof[dependency + '_unavailable'], proof)
                    self.assertFalse(proof[dependency + '_ok'])
                finally:
                    qa.docker('start', name)
                    self.wait_ready()
        self.proofs['readiness_failure_and_recovery'] = True
        OUTPUT.joinpath('railway-backend-summary.json').write_text(json.dumps(self.proofs, indent=2))

    @classmethod
    def cleanup(cls):
        cls.qa.doClassCleanups()
        if cls.qa.tearDown_exceptions:
            raise RuntimeError('Owned Railway fixture cleanup failed') from cls.qa.tearDown_exceptions[0][1]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.cwd()/'ci-evidence/railway-backend')
    parser.add_argument('--app', type=Path, default=APP)
    args = parser.parse_args()
    OUTPUT = args.output.resolve()
    APP = args.app.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    program = unittest.main(argv=[__file__], verbosity=2, exit=False)
    result = program.result
    OUTPUT.joinpath('suite-result.json').write_text(json.dumps({
        'source_sha':getattr(RailwayBackendTest.qa, 'source_sha', None),
        'tests_run':result.testsRun, 'successful':result.wasSuccessful(),
        'failures':len(result.failures), 'errors':len(result.errors), 'skipped':len(result.skipped)}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
