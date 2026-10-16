"""Read-only production checks. Prints fixed categories, never env/config values.

python scripts/production_preflight.py --env-file /private/.env.prod
Add --profile telegram to validate the optional bot, --check-ready for running
Compose backend /ready. Does not start services, migrate, write envs or call DNS.
"""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COMPOSE = ROOT / 'docker-compose.prod.yml'
MAX_ENV_BYTES = 65536
CORE_SERVICES = {'postgres', 'redis', 'backend', 'dashboard', 'caddy'}
REQUEST_FLAGS = ('TRUST_PROXY_HEADERS', 'RATE_LIMIT_ENABLED')
REQUEST_LIMITS = ('RATE_LIMIT_AUTH_MAX', 'RATE_LIMIT_AUTH_WINDOW_SECONDS',
                  'RATE_LIMIT_WRITE_MAX', 'RATE_LIMIT_WRITE_WINDOW_SECONDS')


class EnvFormatError(ValueError):
    pass


def read_env(path):
    """Bounded Compose-style flat dotenv syntax; no eval, shell or expansion."""
    with Path(path).open('rb') as stream:
        raw = stream.read(MAX_ENV_BYTES + 1)
    if len(raw) > MAX_ENV_BYTES:
        raise EnvFormatError('env_format_invalid')
    values = {}
    for line in raw.decode('utf-8-sig').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)', line)
        if not match or match[1] in values:
            raise EnvFormatError('env_format_invalid')
        key, raw_value = match.groups()
        value = raw_value.lstrip()
        if value.startswith('#') and raw_value != value:
            value = ''
        if value.startswith(('"', "'")):
            quote, parsed, index = value[0], [], 1
            while index < len(value) and value[index] != quote:
                if value[index] == '\\' and index + 1 < len(value):
                    following = value[index + 1]
                    escapes = {'n': '\n', 'r': '\r', 't': '\t', '\\': '\\', '"': '"'} if quote == '"' else {"'": "'"}
                    if following in escapes:
                        parsed.append(escapes[following])
                        index += 2
                        continue
                parsed.append(value[index])
                index += 1
            if index >= len(value) or (value[index + 1:].strip() and not value[index + 1:].strip().startswith('#')):
                raise EnvFormatError('env_format_invalid')
            value = ''.join(parsed)
        else:
            value = re.split(r'\s+#', value, maxsplit=1)[0].rstrip()
        if '\x00' in value:
            raise EnvFormatError('env_format_invalid')
        values[key] = value
    return values


def _boolean(value):
    lowered = str(value).strip().lower()
    if lowered in {'true', '1', 'yes', 'on'}: return True
    if lowered in {'false', '0', 'no', 'off'}: return False
    return None


def _domain(value):
    if not isinstance(value, str) or len(value) > 253 or value != value.strip(): return False
    if value.lower() == 'localhost' or any(value.lower() == reserved or value.lower().endswith('.' + reserved)
        for reserved in ('example.com', 'example.org', 'example.net')): return False
    try:
        ipaddress.ip_address(value)
        return False
    except ValueError:
        pass
    labels = value.lower().split('.')
    return (len(labels) >= 2 and labels[-1] not in {'local', 'localhost', 'example', 'test', 'invalid', 'internal'}
        and all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in labels)
        and bool(re.fullmatch(r'[a-z]{2,63}', labels[-1])))


def _https_url(value, domain, *, mini=False):
    try:
        parsed = urlsplit(value)
        allowed_hosts = {domain.lower(), 'www.' + domain.lower()}
        return (parsed.scheme == 'https' and parsed.hostname in allowed_hosts and parsed.username is None
            and parsed.password is None and parsed.port in (None, 443) and not parsed.query and not parsed.fragment
            and parsed.path in (('/mini', '/mini/') if mini else ('',)))
    except (TypeError, ValueError, AttributeError):
        return False


def _secret(value, minimum):
    lowered = value.lower()
    return (len(value.encode('utf-8')) >= minimum and len(set(value)) >= 8
        and not lowered.startswith(('change', '__change', 'replace', '__replace'))
        and not any(marker in lowered for marker in ('change_me', 'change-me', 'change-this', 'replace', 'password', 'secret_key', 'example'))
        and not any(ord(char) < 33 for char in value))


def _check(name, ok, code):
    return {'name': name, 'ok': bool(ok), 'code': 'ok' if ok else code}


def _positive_integer(value):
    return isinstance(value, str) and re.fullmatch(r'[1-9][0-9]*', value) is not None


def validate_env(values, telegram=False):
    domain = values.get('DOMAIN', '')
    contact = values.get('ACME_EMAIL', '')
    contact_parts = contact.rsplit('@', 1)
    password = values.get('POSTGRES_PASSWORD', '')
    identifiers = all(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', values.get(key, ''))
                      for key in ('POSTGRES_USER', 'POSTGRES_DB'))
    checks = [
        _check('environment', values.get('ENVIRONMENT') == 'production'
            and _boolean(values.get('DEBUG')) is False and _boolean(values.get('DEMO_MODE_ENABLED')) is False
            and _boolean(values.get('DATABASE_ECHO', 'false')) is False, 'production_flags_invalid'),
        _check('domain', _domain(domain), 'domain_invalid'),
        _check('tls_contact', len(contact_parts) == 2 and bool(re.fullmatch(r'[A-Za-z0-9.!#$%&\'*+/=?^_`{|}~-]+', contact_parts[0]))
            and _domain(contact_parts[1]), 'acme_email_invalid'),
        _check('database_credentials', identifiers and _secret(password, 20)
            and re.fullmatch(r'[A-Za-z0-9._~-]+', password) is not None, 'database_credentials_invalid'),
        _check('signing_secret', _secret(values.get('SECRET_KEY', ''), 32), 'signing_secret_invalid'),
        _check('cors_origin', bool(values.get('CORS_ORIGINS')) and all(_https_url(origin.strip(), domain)
            for origin in values.get('CORS_ORIGINS', '').split(',')), 'cors_origin_invalid'),
        _check('request_protection', all(_boolean(values.get(key)) is True for key in REQUEST_FLAGS)
            and all(_positive_integer(values.get(key)) for key in REQUEST_LIMITS), 'request_protection_invalid'),
    ]
    if telegram:
        token = values.get('TELEGRAM_BOT_TOKEN', '')
        checks.append(_check('telegram', re.fullmatch(r'[0-9]{5,20}:[A-Za-z0-9_-]{30,100}', token) is not None
            and not any(marker in token.lower() for marker in ('change', 'replace', 'example'))
            and _https_url(values.get('TELEGRAM_MINI_APP_URL', ''), domain, mini=True), 'telegram_settings_invalid'))
    else:
        checks.append({'name': 'telegram', 'ok': True, 'code': 'disabled'})
    return checks


def validate_compose(config, values, telegram=False):
    services = config.get('services', {})
    if not isinstance(services, dict) or not CORE_SERVICES <= services.keys() or set(services) - CORE_SERVICES - {'telegram-bot'}:
        return 'compose_services_invalid'
    for name, service in services.items():
        if not isinstance(service, dict): return 'compose_services_invalid'
        if service.get('network_mode') == 'host' or (name != 'caddy' and service.get('ports')):
            return 'internal_service_ports_exposed'
        if name in CORE_SERVICES and service.get('profiles'): return 'compose_services_invalid'
    bot = services.get('telegram-bot')
    if bot is not None and bot.get('profiles') != ['telegram']: return 'telegram_profile_invalid'
    if telegram and (bot is None or bot.get('environment', {}).get('TELEGRAM_BOT_TOKEN') != values.get('TELEGRAM_BOT_TOKEN')):
        return 'telegram_environment_invalid'
    backend = services['backend'].get('environment', {})
    if (any(_boolean(backend.get(key)) is not True for key in REQUEST_FLAGS)
            or any(not _positive_integer(backend.get(key)) or backend.get(key) != values.get(key) for key in REQUEST_LIMITS)):
        return 'backend_request_protection_invalid'
    if (backend.get('ENVIRONMENT') != 'production' or _boolean(backend.get('DEBUG')) is not False
            or _boolean(backend.get('DEMO_MODE_ENABLED')) is not False or _boolean(backend.get('DATABASE_ECHO', 'false')) is not False
            or backend.get('SECRET_KEY') != values.get('SECRET_KEY') or backend.get('CORS_ORIGINS') != values.get('CORS_ORIGINS')):
        return 'backend_environment_invalid'
    database_url = 'postgresql+asyncpg://' + values['POSTGRES_USER'] + ':' + values['POSTGRES_PASSWORD'] + '@postgres:5432/' + values['POSTGRES_DB']
    if backend.get('DATABASE_URL') != database_url or backend.get('REDIS_URL') != 'redis://redis:6379/0':
        return 'backend_internal_dependencies_invalid'
    database = services['postgres'].get('environment', {})
    if any(database.get(key) != values.get(key) for key in ('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB')):
        return 'database_environment_invalid'
    dashboard = services['dashboard'].get('environment', {})
    if dashboard.get('NODE_ENV') != 'production' or dashboard.get('NEXT_PUBLIC_API_URL') != 'http://backend:8000/api/v1' or dashboard.get('GARAGEOS_TRUST_CADDY_IP') != 'true':
        return 'dashboard_proxy_contract_invalid'
    caddy = services['caddy'].get('environment', {})
    if caddy.get('DOMAIN') != values.get('DOMAIN') or caddy.get('ACME_EMAIL') != values.get('ACME_EMAIL'):
        return 'proxy_environment_invalid'
    ports = services['caddy'].get('ports', [])
    if len(ports) != 2 or {(str(port.get('published')), str(port.get('target'))) for port in ports if isinstance(port, dict)} != {('80', '80'), ('443', '443')}:
        return 'proxy_ports_invalid'
    return 'ok'


READY_PROBE = """import json, sys
from urllib.request import urlopen
from urllib.error import HTTPError
try:
    try:
        response = urlopen('http://127.0.0.1:8000/ready', timeout=5)
    except HTTPError as error:
        response = error
    with response:
        status = response.status
        raw = response.read(65537)
        payload = json.loads(raw) if len(raw) <= 65536 else {}
    checks = payload.get('checks', {})
    database = checks.get('database', {}).get('ok') is True
    redis = checks.get('redis', {}).get('ok') is True
    print(json.dumps({'ok': status == 200 and payload.get('status') == 'ready' and database and redis,
                      'database': database, 'redis': redis}))
except Exception:
    print(json.dumps({'ok': False, 'database': False, 'redis': False}))
"""


def run_preflight(env_file, compose_file=DEFAULT_COMPOSE, *, telegram=False, check_ready=False):
    report = {'ok': False, 'telegram_enabled': bool(telegram), 'readiness_requested': bool(check_ready), 'checks': []}
    try:
        env_file, compose_file = Path(env_file).resolve(), Path(compose_file).resolve()
        values = read_env(env_file)
    except (OSError, UnicodeError, EnvFormatError):
        report['checks'] = [_check('environment_file', False, 'env_file_unreadable_or_invalid')]
        return report
    report['checks'] = validate_env(values, telegram)
    if not all(check['ok'] for check in report['checks']): return report
    # Shell variables win over --env-file in Compose. Pin only relevant parsed
    # values and profile selection, avoiding unrelated dotenv control variables.
    relevant = {'DOMAIN', 'ACME_EMAIL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB',
                'SECRET_KEY', 'ENVIRONMENT', 'DEBUG', 'DATABASE_ECHO', 'DEMO_MODE_ENABLED',
                'CORS_ORIGINS', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_MINI_APP_URL'}
    relevant.update(REQUEST_FLAGS + REQUEST_LIMITS)
    process_env = {**os.environ, **{key: value for key, value in values.items() if key in relevant},
                   'GARAGEOS_ENV_FILE': str(env_file), 'COMPOSE_PROFILES': 'telegram' if telegram else ''}
    command = ['docker', 'compose', '--project-directory', str(compose_file.parent),
               '--env-file', str(env_file), '-f', str(compose_file)]
    if telegram: command += ['--profile', 'telegram']
    try:
        result = subprocess.run(command + ['config', '--format=json'], env=process_env,
            capture_output=True, text=True, encoding='utf-8', timeout=30, check=False)
        if result.returncode:
            code = 'compose_invalid'
        else:
            code = validate_compose(json.loads(result.stdout), values, telegram)
    except (OSError, subprocess.TimeoutExpired):
        code = 'compose_unavailable'
    except (ValueError, TypeError, AttributeError, KeyError):
        code = 'compose_invalid'
    report['checks'].append(_check('compose', code == 'ok', code))
    if code != 'ok': return report
    if check_ready:
        try:
            result = subprocess.run(command + ['exec', '-T', 'backend', 'python', '-c', READY_PROBE],
                env=process_env, capture_output=True, text=True, encoding='utf-8', timeout=15, check=False)
            readiness = json.loads(result.stdout) if not result.returncode else {}
            good = all(readiness.get(key) is True for key in ('ok', 'database', 'redis'))
            code = 'ok' if good else 'backend_dependencies_not_ready'
        except (OSError, ValueError, TypeError, AttributeError, subprocess.TimeoutExpired):
            good, code = False, 'readiness_unavailable'
        report['checks'].append(_check('readiness', good, code))
    report['ok'] = all(check['ok'] for check in report['checks'])
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=ROOT / '.env.prod')
    parser.add_argument('--compose-file', type=Path, default=DEFAULT_COMPOSE)
    parser.add_argument('--profile', choices=['telegram'])
    parser.add_argument('--check-ready', action='store_true')
    args = parser.parse_args(argv)
    report = run_preflight(args.env_file, args.compose_file, telegram=args.profile == 'telegram', check_ready=args.check_ready)
    print(json.dumps(report, sort_keys=True))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
