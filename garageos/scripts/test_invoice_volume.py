"""Real invoice-history volume rehearsal; Linux Docker/Compose are required."""
import argparse
import hashlib
import json
from pathlib import Path
import unittest

import test_database_recovery as recovery

ROOT = recovery.ROOT
OUTPUT = None


class InvoiceVolumeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        recovery.OUTPUT = OUTPUT
        cls.qa = recovery.DatabaseRecoveryTest
        # Reuse the existing owned production environment, not its recovery tests.
        cls.addClassCleanup(cls.cleanup)
        cls.qa.setUpClass()
        cls.fixture = cls.qa.private/'invoice_volume_fixture.py'
        cls.fixture.write_bytes((ROOT/'scripts/invoice_volume_fixture.py').read_bytes())
        cls.fixture.chmod(0o644)
        cls.seed = cls.fixture_command('seed-volume')
        docker_info = json.loads(cls.qa.docker('info', '--format', '{{json .}}').stdout)
        cls.environment = {key: docker_info[key] for key in
                           ('ServerVersion', 'OSType', 'Architecture', 'KernelVersion', 'NCPU', 'MemTotal')}
        cls.api = cls.qa.start_backend('volume', cls.qa.backend_env)
        with cls.qa.backend_env.open('a') as file:
            file.write('GARAGEOS_VOLUME_API_HOST=' + cls.api + '\n')

    @classmethod
    def fixture_command(cls, command):
        qa = cls.qa
        name = qa.tag + '-volume-' + command
        qa.containers.append(name)
        result = qa.docker('run', '--rm', '--name', name, '--label', recovery.OWNER + '=' + qa.tag,
                           '--network', qa.network, '--env-file', qa.backend_env,
                           '--mount', f'type=bind,src={qa.fixture},dst=/recovery_fixture.py,readonly',
                           '--mount', f'type=bind,src={cls.fixture},dst=/invoice_volume_fixture.py,readonly',
                           qa.image, 'python', '/invoice_volume_fixture.py', command,
                           log='volume-' + command, timeout=600)
        return json.loads(result.stdout)

    def test_01_query_growth_and_real_http_profile(self):
        queries = self.fixture_command('query-profile')
        (OUTPUT/'query-profile.json').write_text(json.dumps(queries, indent=2))
        http = self.fixture_command('http-profile')
        report = {**self.qa.identities, 'dataset': self.seed, 'queries': queries, 'http': http,
                  'docker_environment': self.environment,
                  'fixture_sha256': hashlib.sha256(self.fixture.read_bytes()).hexdigest(),
                  'backend_workers': 1, 'network': 'isolated Docker HTTP; no public/WAN/TLS/device timing',
                  'hardware_independent_latency_gate': False}
        (OUTPUT/'invoice-volume-summary.json').write_text(json.dumps(report, indent=2))
        counts = [page['sql_statements'] for page in queries['pages']]
        self.assertLessEqual(counts[-1], 20, 'Invoice history query work is amplified by page rows')
        self.assertLessEqual(counts[-1] - counts[0], 5, 'Invoice query work grows with page size')

    @classmethod
    def cleanup(cls):
        # Public unittest lifecycle runs the resource cleanup registered by setup.
        cls.qa.doClassCleanups()
        if cls.qa.tearDown_exceptions:
            raise RuntimeError('Owned volume fixture cleanup failed') from cls.qa.tearDown_exceptions[0][1]
        path = OUTPUT/'cleanup.json'
        if not path.exists():
            raise RuntimeError('Volume fixture cleanup is unproven; inspect owned resources')
        proof = json.loads(path.read_text())
        if (proof['run'] != cls.qa.tag or not proof['owned_resources_removed']
                or not proof['private_fixtures_removed']):
            raise RuntimeError('Volume fixture cleanup failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.cwd()/'ci-evidence/invoice-volume')
    args = parser.parse_args()
    OUTPUT = args.output.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    program = unittest.main(argv=[__file__], verbosity=2, exit=False)
    result = program.result
    (OUTPUT/'suite-result.json').write_text(json.dumps({
        'tests_run': result.testsRun, 'successful': result.wasSuccessful(),
        'failures': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped)}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
