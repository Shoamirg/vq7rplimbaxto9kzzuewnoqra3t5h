"""Production preflight contracts using private temporary envs and mocked CLI."""
from copy import deepcopy
from contextlib import redirect_stdout, redirect_stderr
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


class ProductionPreflightTest(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).with_name('production_preflight.py')
        spec = importlib.util.spec_from_file_location('production_preflight_contract', path)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory(prefix='garageos-preflight-test-')
        self.addCleanup(self.temp.cleanup)
        self.env_file = Path(self.temp.name) / 'private deployment.env'
        self.values = {'DOMAIN': 'garageos.uz', 'ACME_EMAIL': 'ops@garageos.uz',
            'POSTGRES_USER': 'garage_prod', 'POSTGRES_DB': 'garage_platform',
            'POSTGRES_PASSWORD': '4d78a096fb251de83719bc05e42a673f',
            'SECRET_KEY': '54ed03bac7162958f08ac69713402d96cb7381ef5094aabc687530ad792160de',
            'ENVIRONMENT': 'production', 'DEBUG': 'false', 'DEMO_MODE_ENABLED': 'false',
            'DATABASE_ECHO': 'false', 'CORS_ORIGINS': 'https://garageos.uz',
            'TRUST_PROXY_HEADERS': 'true', 'RATE_LIMIT_ENABLED': 'true',
            'RATE_LIMIT_AUTH_MAX': '10', 'RATE_LIMIT_AUTH_WINDOW_SECONDS': '60',
            'RATE_LIMIT_WRITE_MAX': '60', 'RATE_LIMIT_WRITE_WINDOW_SECONDS': '60',
            'TELEGRAM_BOT_TOKEN': '', 'TELEGRAM_MINI_APP_URL': 'https://garageos.uz/mini'}
        self.write_env()
        self.config = {'services': {'postgres': {'environment': {key: self.values[key]
            for key in ('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB')}}, 'redis': {},
            'backend': {'environment': {**self.values, 'DATABASE_URL': 'postgresql+asyncpg://garage_prod:' + self.values['POSTGRES_PASSWORD'] + '@postgres:5432/garage_platform',
                'REDIS_URL': 'redis://redis:6379/0'}},
            'dashboard': {'environment': {'NODE_ENV': 'production',
                'NEXT_PUBLIC_API_URL': 'http://backend:8000/api/v1', 'GARAGEOS_TRUST_CADDY_IP': 'true'}},
            'caddy': {'environment': {'DOMAIN': 'garageos.uz', 'ACME_EMAIL': 'ops@garageos.uz'},
                'ports': [{'target': 80, 'published': '80'}, {'target': 443, 'published': '443'}]},
            'telegram-bot': {'profiles': ['telegram'], 'environment': dict(self.values)}}}

    def write_env(self):
        self.env_file.write_text(''.join(key + '=' + value + '\n' for key, value in self.values.items()), encoding='utf-8')
        if hasattr(self, 'config'):
            self.config['services']['telegram-bot']['environment'] = dict(self.values)

    def command(self, args, **kwargs):
        if args[-2:] == ['config', '--format=json']:
            return subprocess.CompletedProcess(args, 0, json.dumps(self.config), '')
        if 'exec' in args:
            return subprocess.CompletedProcess(args, 0, json.dumps({'ok': True, 'database': True, 'redis': True}), '')
        raise AssertionError('Unexpected command')

    def run_preflight(self, **options):
        with patch.object(self.module.subprocess, 'run', side_effect=self.command) as command:
            result = self.module.run_preflight(self.env_file, self.module.DEFAULT_COMPOSE, **options)
        return result, command

    def test_valid_default_stack_does_not_require_telegram(self):
        result, command = self.run_preflight()
        self.assertTrue(result['ok'])
        self.assertFalse(result['telegram_enabled'])
        self.assertFalse(result['readiness_requested'])
        self.assertEqual(command.call_count, 1)
        self.assertNotIn('--profile', command.call_args.args[0])

    def test_telegram_enabled_requires_real_token_and_canonical_https_mini_url(self):
        result, command = self.run_preflight(telegram=True)
        self.assertFalse(result['ok'])
        self.assertEqual(command.call_count, 0)
        self.values['TELEGRAM_BOT_TOKEN'] = '123456789:AbCDeFgHiJkLmNoPqRsTuVwXyZ_0123456789'
        self.write_env()
        result, command = self.run_preflight(telegram=True)
        self.assertTrue(result['ok'])
        self.assertIn('--profile', command.call_args.args[0])
        self.values['TELEGRAM_MINI_APP_URL'] = 'http://garageos.uz/mini'
        self.write_env()
        self.assertFalse(self.run_preflight(telegram=True)[0]['ok'])

    def test_placeholders_missing_secrets_and_weak_passwords_fail_before_compose(self):
        for key, value in [('SECRET_KEY', '__CHANGE_ME_openssl_rand_hex_32__'),
                ('SECRET_KEY', 'changeThisGeneratedLookingButStillPlaceholder-1234567890'),
                ('SECRET_KEY', 'a' * 64), ('POSTGRES_PASSWORD', 'password'),
                ('POSTGRES_PASSWORD', 'a' * 40), ('POSTGRES_PASSWORD', ''), ('ACME_EMAIL', 'ops@garageos.example')]:
            with self.subTest(key=key):
                original = self.values[key]
                self.values[key] = value
                self.write_env()
                result, command = self.run_preflight()
                self.assertFalse(result['ok'])
                self.assertEqual(command.call_count, 0)
                self.values[key] = original

    def test_debug_demo_invalid_domain_and_noncanonical_cors_are_rejected(self):
        for key, value in [('DEBUG', 'true'), ('DEMO_MODE_ENABLED', 'true'),
                ('DOMAIN', 'https://garageos.uz/path'), ('DOMAIN', '127.0.0.1'),
                ('DOMAIN', 'localhost'), ('DOMAIN', '*.garageos.uz'),
                ('DOMAIN', 'garageos.uz:443'), ('CORS_ORIGINS', 'https://attacker.example.org'),
                ('CORS_ORIGINS', 'http://garageos.uz'), ('DATABASE_ECHO', 'true')]:
            with self.subTest(key=key, value=value):
                original = self.values[key]
                self.values[key] = value
                self.write_env()
                self.assertFalse(self.run_preflight()[0]['ok'])
                self.values[key] = original

    def test_database_password_cannot_break_interpolated_database_url(self):
        self.values['POSTGRES_PASSWORD'] += '@/?$#'
        self.write_env()
        self.assertFalse(self.run_preflight()[0]['ok'])

    def test_bounded_dotenv_quotes_comments_and_unknown_fields_are_data(self):
        self.env_file.write_text("# private env\nDOMAIN='garageos.uz' # comment\nNOTE=\"literal # text\"\n" +
            'UNRELATED=$(touch /tmp/never-executed)\nEMPTY=   # intentionally blank\nHASH=#literal\n', encoding='utf-8')
        values = self.module.read_env(self.env_file)
        self.assertEqual(values['DOMAIN'], 'garageos.uz')
        self.assertEqual(values['NOTE'], 'literal # text')
        self.assertEqual(values['UNRELATED'], '$(touch /tmp/never-executed)')
        self.assertEqual(values['EMPTY'], '')
        self.assertEqual(values['HASH'], '#literal')
        self.env_file.write_text('DOMAIN=garageos.uz\nDOMAIN=other.uz\n', encoding='utf-8')
        self.assertFalse(self.run_preflight()[0]['ok'])
        self.env_file.write_bytes(b'x' * 65537)
        self.assertFalse(self.run_preflight()[0]['ok'])

    def test_unknown_extra_services_host_network_or_published_internal_ports_are_rejected(self):
        for mutate in [lambda cfg: cfg['services']['postgres'].update(ports=[{'published': '5432', 'target': 5432}]),
                lambda cfg: cfg['services']['backend'].update(network_mode='host'),
                lambda cfg: cfg['services'].update(debug={}),
                lambda cfg: cfg['services']['dashboard']['environment'].pop('GARAGEOS_TRUST_CADDY_IP'),
                lambda cfg: cfg['services']['telegram-bot'].pop('profiles')]:
            original = deepcopy(self.config)
            mutate(self.config)
            self.assertFalse(self.run_preflight()[0]['ok'])
            self.config = original

    def test_effective_compose_security_must_match_private_env(self):
        for field, value in [('SECRET_KEY', 'different-signing-value'), ('DEBUG', 'true'),
                ('DATABASE_URL', 'postgresql+asyncpg://root:bad@public.example.org:5432/production')]:
            original = self.config['services']['backend']['environment'][field]
            self.config['services']['backend']['environment'][field] = value
            self.assertFalse(self.run_preflight()[0]['ok'])
            self.config['services']['backend']['environment'][field] = original

    def test_dashboard_opt_in_matches_the_bff_exact_true_contract(self):
        dashboard = self.config['services']['dashboard']['environment']
        for invalid in ('1', 'yes', 'on', 'True', True):
            with self.subTest(invalid=invalid):
                dashboard['GARAGEOS_TRUST_CADDY_IP'] = invalid
                self.assertFalse(self.run_preflight()[0]['ok'])
        dashboard['GARAGEOS_TRUST_CADDY_IP'] = 'true'
        self.assertTrue(self.run_preflight()[0]['ok'])

    def test_proxy_trust_and_rate_limits_are_required_private_production_controls(self):
        flags = ('TRUST_PROXY_HEADERS', 'RATE_LIMIT_ENABLED')
        limits = ('RATE_LIMIT_AUTH_MAX', 'RATE_LIMIT_AUTH_WINDOW_SECONDS',
                  'RATE_LIMIT_WRITE_MAX', 'RATE_LIMIT_WRITE_WINDOW_SECONDS')
        for key, invalid in [(key, value) for key in flags for value in ('', 'false', 'oops')] + [
                (key, value) for key in limits for value in ('', '0', '-1', '1.5', 'oops')]:
            with self.subTest(key=key, invalid=invalid):
                previous = self.values[key]
                self.values[key] = invalid
                self.write_env()
                result, command = self.run_preflight()
                self.assertFalse(result['ok'])
                self.assertEqual(command.call_count, 0)
                self.values[key] = previous
        self.write_env()

    def test_effective_proxy_and_rate_limits_cannot_override_private_intent(self):
        backend = self.config['services']['backend']['environment']
        for key, changed in [('TRUST_PROXY_HEADERS', 'false'), ('RATE_LIMIT_ENABLED', 'false'),
                ('RATE_LIMIT_AUTH_MAX', '11'), ('RATE_LIMIT_AUTH_WINDOW_SECONDS', '61'),
                ('RATE_LIMIT_WRITE_MAX', '61'), ('RATE_LIMIT_WRITE_WINDOW_SECONDS', '61')]:
            with self.subTest(key=key):
                original = backend[key]
                backend[key] = changed
                self.assertFalse(self.run_preflight()[0]['ok'])
                backend[key] = original

    def test_ambient_proxy_and_rate_values_are_pinned_to_private_env_for_compose(self):
        keys = ('TRUST_PROXY_HEADERS', 'RATE_LIMIT_ENABLED', 'RATE_LIMIT_AUTH_MAX',
                'RATE_LIMIT_AUTH_WINDOW_SECONDS', 'RATE_LIMIT_WRITE_MAX', 'RATE_LIMIT_WRITE_WINDOW_SECONDS')
        with patch.dict(os.environ, {key: 'false' if key in keys[:2] else '0' for key in keys}):
            result, command = self.run_preflight()
        self.assertTrue(result['ok'])
        for key in keys:
            self.assertEqual(command.call_args.kwargs['env'][key], self.values[key])

    def test_readiness_is_optional_fixed_private_target_and_requires_db_and_redis(self):
        result, command = self.run_preflight(check_ready=True)
        self.assertTrue(result['ok'])
        self.assertEqual(command.call_count, 2)
        ready_args = command.call_args.args[0]
        self.assertIn('exec', ready_args)
        self.assertIn('http://127.0.0.1:8000/ready', ready_args[-1])
        for payload in [{'ok': False, 'database': False, 'redis': True},
                        {'ok': False, 'database': True, 'redis': False}, {'status': 'ok'}]:
            with patch.object(self.module.subprocess, 'run', side_effect=[
                subprocess.CompletedProcess([], 0, json.dumps(self.config), ''),
                subprocess.CompletedProcess([], 0, json.dumps(payload), '')]):
                result = self.module.run_preflight(self.env_file, self.module.DEFAULT_COMPOSE, check_ready=True)
            self.assertFalse(result['ok'])

    def test_private_probe_requires_http200_ready_and_both_dependencies_without_error_leaks(self):
        private_error = self.values['POSTGRES_PASSWORD']
        class Response:
            def __init__(self, status, payload):
                self.status, self.payload = status, payload
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return json.dumps(self.payload).encode()[:limit]
        valid = {'status': 'ready', 'checks': {'database': {'ok': True}, 'redis': {'ok': True}}}
        for status, payload, expected in [(200, valid, True), (503, valid, False),
                (200, {'status': 'ok'}, False), (200, {'status': 'ready', 'checks': {
                    'database': {'ok': False, 'error': private_error}, 'redis': {'ok': True}}}, False),
                (200, {'status': 'ready', 'checks': {'database': {'ok': True}, 'redis': {'ok': False}}}, False)]:
            output = io.StringIO()
            with patch('urllib.request.urlopen', return_value=Response(status, payload)), redirect_stdout(output):
                # Only this trusted fixed probe source executes; no dotenv or
                # response value is ever used as executable source.
                exec(self.module.READY_PROBE, {})
            self.assertEqual(json.loads(output.getvalue())['ok'], expected)
            self.assertNotIn(private_error, output.getvalue())

    def test_missing_file_timeout_and_duplicate_critical_keys_fail_closed_safely(self):
        result = self.module.run_preflight(self.env_file.parent / 'missing', self.module.DEFAULT_COMPOSE)
        self.assertFalse(result['ok'])
        with patch.object(self.module.subprocess, 'run', side_effect=subprocess.TimeoutExpired([], 30, output=self.values['SECRET_KEY'])):
            result = self.module.run_preflight(self.env_file, self.module.DEFAULT_COMPOSE)
        self.assertFalse(result['ok'])
        self.assertNotIn(self.values['SECRET_KEY'], json.dumps(result))
        with self.env_file.open('a', encoding='utf-8') as file:
            file.write('SECRET_KEY=second-copy\n')
        self.assertFalse(self.run_preflight()[0]['ok'])

    def test_failure_outputs_never_publish_env_subprocess_stdout_or_stderr(self):
        private = self.values['SECRET_KEY'] + self.values['POSTGRES_PASSWORD']
        with patch.object(self.module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, private, private)):
            result = self.module.run_preflight(self.env_file, self.module.DEFAULT_COMPOSE)
        report = json.dumps(result)
        for value in (private, self.values['SECRET_KEY'], self.values['POSTGRES_PASSWORD']):
            self.assertNotIn(value, report)
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(self.module.subprocess, 'run', side_effect=OSError(private)), redirect_stdout(output), redirect_stderr(errors):
            code = self.module.main(['--env-file', str(self.env_file)])
        self.assertEqual(code, 1)
        self.assertNotIn(private, output.getvalue() + errors.getvalue())
        self.assertEqual(json.loads(output.getvalue())['checks'][-1]['code'], 'compose_unavailable')

    def test_declared_production_compose_has_optional_bot_and_trusted_dashboard(self):
        text = self.module.DEFAULT_COMPOSE.read_text(encoding='utf-8')
        self.assertIn('profiles: [telegram]', text)
        self.assertIn('GARAGEOS_TRUST_CADDY_IP:', text)
        self.assertIn('${GARAGEOS_ENV_FILE:-.env.prod}', text)


if __name__ == '__main__':
    unittest.main(verbosity=2)
