"""Actual Caddy -> production Next BFF -> production API/Redis quota rehearsal.

Linux Docker/Compose required. No host ports, live accounts or shared resources.
Run with --output PRIVATE_EVIDENCE_DIRECTORY; failures and cleanup fail nonzero.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time
import unittest

import test_database_recovery as recovery

ROOT = recovery.ROOT
OUTPUT = None
QUOTA = 4
WINDOW = 300
NATIVE = '/api/v1/auth/login'
BFF = '/api/auth/login'

# Only fixed stdlib client code runs in the two private peer containers. Never
# return response bodies/cookies or socket addresses, including on failures.
CLIENT_PROBE = """import json, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError
path, attempt, warm = sys.argv[1], int(sys.argv[2]), sys.argv[3] == 'warm'
body = None if warm else json.dumps({'email':'recovery-staff-a@example.com',
                                     'password':'intentional-incorrect-qa-password'}).encode()
headers = {'Host':'routing.garageos.local', 'Origin':'http://routing.garageos.local',
           'Content-Type':'application/json', 'X-Real-IP':'198.51.100.' + str(1 + attempt % 200),
           'X-Forwarded-For':'203.0.113.9, 198.51.100.' + str(1 + attempt % 200),
           'X-Forwarded-Host':'forged.invalid', 'X-Forwarded-Proto':'https'}
try:
    try: response = urlopen(Request('http://caddy' + path, data=body, headers=headers), timeout=10)
    except HTTPError as error: response = error
    with response:
        retry = response.headers.get('Retry-After', '')
        result = {'status':response.status, 'retry_after_valid':retry.isdecimal() and 0 < int(retry) <= 300,
                  'has_set_cookie':bool(response.headers.get_all('Set-Cookie')), 'transport_ok':True}
        response.read(65537)
except Exception:
    result = {'status':0, 'retry_after_valid':False, 'has_set_cookie':False, 'transport_ok':False}
print(json.dumps(result))
"""


class BffPublicRoutingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        recovery.OUTPUT = OUTPUT
        cls.qa = recovery.DatabaseRecoveryTest
        cls.dashboard_image = None
        cls.addClassCleanup(cls.cleanup)
        # Reuse the proven production PG fixture and exact owned-resource cleanup,
        # not its recovery test methods. This creates an independent run each time.
        cls.qa.setUpClass()
        qa = cls.qa
        cls.dashboard_image = 'garageos-bff-dashboard:' + qa.tag
        if qa.inspect('image', cls.dashboard_image):
            raise RuntimeError('Refusing to adopt an existing dashboard QA image')
        qa.docker('build', '--label', recovery.OWNER + '=' + qa.tag,
                  '--label', 'org.opencontainers.image.revision=' + qa.source_sha,
                  '-f', ROOT/'docker/Dockerfile.dashboard.prod', '-t', cls.dashboard_image,
                  ROOT, log='dashboard-build', timeout=1200)
        cls.auth_redis = cls.start('auth-redis', qa.redis_image,
                                  ['--network-alias', 'auth-redis'])
        env = qa.private/'bff backend.env'
        env.write_text(qa.backend_env.read_text().replace('redis://redis:', 'redis://auth-redis:')
            + '\nTRUST_PROXY_HEADERS=true\nRATE_LIMIT_ENABLED=true\n'
            + f'RATE_LIMIT_AUTH_MAX={QUOTA}\nRATE_LIMIT_AUTH_WINDOW_SECONDS={WINDOW}\n')
        env.chmod(0o600)
        cls.api = cls.start('bff-api', qa.image, ['--network-alias', 'backend', '--env-file', env])
        cls.start('dashboard', cls.dashboard_image, ['--network-alias', 'dashboard',
                  '-e', 'NODE_ENV=production', '-e', 'GARAGEOS_TRUST_CADDY_IP=true',
                  '-e', 'NEXT_PUBLIC_API_URL=http://backend:8000/api/v1'])
        caddyfile = qa.private/'Caddyfile'
        caddyfile.write_bytes((ROOT/'docker/Caddyfile').read_bytes())
        caddyfile.chmod(0o644)
        cls.start('caddy', 'caddy:2-alpine', ['--network-alias', 'caddy',
                  '-e', 'DOMAIN=http://routing.garageos.local', '-e', 'ACME_EMAIL=qa@example.com',
                  '--mount', f'type=bind,src={caddyfile},dst=/etc/caddy/Caddyfile,readonly'])
        cls.peers = [cls.start('peer-' + name, qa.image, [],
                              ['python', '-c', 'import time; time.sleep(3600)']) for name in ('a', 'b')]
        cls.peer_ips = [qa.inspect('container', peer)['NetworkSettings']['Networks'][qa.network]['IPAddress']
                        for peer in cls.peers]
        if not all(cls.peer_ips) or len(set(cls.peer_ips)) != 2:
            raise RuntimeError('Independent client socket peers are unproven')
        qa.secrets.extend(cls.peer_ips)  # Also redact these from exceptional gate diagnostics.
        for _ in range(80):
            ready = qa.docker('exec', cls.api, 'curl', '-fsS', 'http://127.0.0.1:8000/ready',
                              allow_failure=True)
            if not ready.returncode and all(cls.request(cls.peers[0], path, 0, warm=True)['status'] == 405
                                           for path in (NATIVE, BFF)):
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('Owned production routing chain readiness timed out')
        cls.receipt = {'run': qa.tag, 'source_sha': qa.source_sha,
                       'test_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                       'caddyfile_sha256': hashlib.sha256(caddyfile.read_bytes()).hexdigest(),
                       'dashboard_image_id': qa.inspect('image', cls.dashboard_image)['Id'],
                       'backend_image_id': qa.inspect('image', qa.image)['Id'],
                       'quota': QUOTA, 'window_seconds': WINDOW, 'distinct_socket_peers': True,
                       'host_ports_published': False, 'requests': []}

    @classmethod
    def start(cls, suffix, image, options, command=()):
        qa = cls.qa
        name = qa.tag + '-routing-' + suffix
        if qa.inspect('container', name):
            raise RuntimeError('Refusing to adopt an existing routing QA container')
        qa.containers.append(name)  # Cleanup must also catch partial launches.
        qa.docker('run', '-d', '--name', name, '--label', recovery.OWNER + '=' + qa.tag,
                  '--network', qa.network, *options, image, *command)
        return name

    @classmethod
    def request(cls, peer, path, attempt, *, warm=False):
        result = cls.qa.docker('exec', peer, 'python', '-c', CLIENT_PROBE, path, str(attempt),
                               'warm' if warm else 'login')
        return json.loads(result.stdout)

    def test_shared_native_bff_quota_is_bound_to_each_caddy_socket_peer(self):
        for peer_index, peer in enumerate(self.peers):
            # A rotating forged IP cannot reset the same peer's native/BFF quota;
            # the other real peer can still consume its whole independent quota.
            for attempt in range(1, QUOTA + 3):
                path = (NATIVE, BFF)[(attempt + peer_index) % 2]
                expected = 401 if attempt <= QUOTA else 429
                result = self.request(peer, path, attempt)
                self.receipt['requests'].append({'peer': peer_index + 1, 'route': 'bff' if path == BFF else 'native',
                                                 'attempt': attempt, **result})
                self.assertTrue(result['transport_ok'], 'Private peer transport failed')
                self.assertEqual(result['status'], expected, 'Native/BFF peer quota diverged')
                self.assertFalse(result['has_set_cookie'], 'Rejected login issued a cookie')
                if expected == 429:
                    self.assertTrue(result['retry_after_valid'], 'Rate limit lacks bounded Retry-After')
        # Observe actual Redis state without exporting keys or addresses. Exactly
        # two auth counters must match the two socket peers, never a forged IP or BFF.
        script = ("local keys=redis.call('KEYS','rl:auth:*'); return {#keys,"
                  "tonumber(redis.call('GET','rl:auth:'..ARGV[1]) or '-1'),"
                  "tonumber(redis.call('GET','rl:auth:'..ARGV[2]) or '-1'),"
                  "redis.call('TTL','rl:auth:'..ARGV[1]),redis.call('TTL','rl:auth:'..ARGV[2])}")
        raw = self.qa.docker('exec', self.auth_redis, 'redis-cli', '--raw', 'EVAL', script, '0', *self.peer_ips)
        counts = [int(value) for value in raw.stdout.splitlines()]
        self.assertEqual(counts[:3], [2, QUOTA + 2, QUOTA + 2], 'Canonical peer Redis counters diverged')
        self.assertTrue(all(0 < ttl <= WINDOW for ttl in counts[3:]), 'Auth counters lack expiry')
        self.assertEqual(len(counts), 5, 'Redis proof shape is invalid')
        self.receipt['canonical_peer_counters_verified'] = True
        (OUTPUT/'bff-public-routing-summary.json').write_text(json.dumps(self.receipt, indent=2))

    @classmethod
    def cleanup(cls):
        qa = cls.qa
        qa.doClassCleanups()
        if qa.tearDown_exceptions:
            raise RuntimeError('Owned routing fixture cleanup failed') from qa.tearDown_exceptions[0][1]
        if cls.dashboard_image:
            info = qa.inspect('image', cls.dashboard_image)
            if info:
                if (info['Config']['Labels'].get(recovery.OWNER) != qa.tag
                        or info['Config']['Labels'].get('org.opencontainers.image.revision') != qa.source_sha):
                    raise RuntimeError('Dashboard QA image ownership changed')
                qa.docker('image', 'rm', cls.dashboard_image)
        proof_path = OUTPUT/'cleanup.json'
        proof = json.loads(proof_path.read_text())
        if proof['run'] != qa.tag or not proof['owned_resources_removed'] or not proof['private_fixtures_removed']:
            raise RuntimeError('Routing fixture cleanup is unproven')
        proof.update(source_sha=qa.source_sha, dashboard_image_removed=True)
        proof_path.write_text(json.dumps(proof))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.cwd()/'ci-evidence/bff-public-routing')
    OUTPUT = parser.parse_args().output.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    program = unittest.main(argv=[__file__], verbosity=2, exit=False)
    result = program.result
    (OUTPUT/'suite-result.json').write_text(json.dumps({
        'run': getattr(BffPublicRoutingTest.qa, 'tag', None),
        'source_sha': getattr(BffPublicRoutingTest.qa, 'source_sha', None),
        'tests_run': result.testsRun, 'successful': result.wasSuccessful(),
        'failures': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped)}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
