"""Exercise the production Caddyfile through HTTP; requires Docker (Linux containers).

Run: python garageos/scripts/test_public_routing.py
Upstreams are disposable transport fixtures, not application/authentication tests.
Only the proxy's random loopback port is published; no production stack is used.
"""

import json
import subprocess
import sys
import time
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def serve_fixture(name, port):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            data = json.dumps({
                "upstream": name, "method": self.command, "path": self.path,
                "body": body.decode(), "headers": dict(self.headers),
            }).encode()
            self.send_response(401 if self.path == "/api/v1/auth/me" else 200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_POST = do_GET

        def log_message(self, *args):
            pass

    ThreadingHTTPServer(("0.0.0.0", int(port)), Handler).serve_forever()


def docker(*args):
    return subprocess.run(
        ["docker", *args], check=True, capture_output=True, text=True, timeout=120,
    ).stdout.strip()


class PublicRoutingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.prefix = "garageos-routing-" + uuid.uuid4().hex[:12]
        cls.containers = []
        cls.addClassCleanup(cls.cleanup)
        docker("network", "create", cls.prefix)
        script = Path(__file__).resolve()
        config = script.parents[1] / "docker" / "Caddyfile"
        for name, port in (("backend", 8000), ("dashboard", 3000)):
            container = cls.prefix + "-" + name
            cls.containers.append(container)
            docker("run", "-d", "--name", container, "--network", cls.prefix,
                   "--network-alias", name, "--mount",
                   f"type=bind,src={script},dst=/fixture.py,readonly",
                   "python:3.12-alpine", "python", "/fixture.py", "--serve", name, str(port))
        cls.proxy = cls.prefix + "-caddy"
        cls.containers.append(cls.proxy)
        docker("run", "-d", "--name", cls.proxy, "--network", cls.prefix,
               "-p", "127.0.0.1::80", "-e", "DOMAIN=http://localhost",
               "-e", "ACME_EMAIL=test@example.com", "--mount",
               f"type=bind,src={config},dst=/etc/caddy/Caddyfile,readonly",
               "caddy:2-alpine")
        published = docker("port", cls.proxy, "80/tcp")
        cls.url = "http://" + published
        for _ in range(40):
            try:
                cls.request("/")
                break
            # Docker can publish its port before Caddy accepts connections;
            # the proxy can also return a non-JSON 502 while fixtures start.
            # Retry only during startup; normal requests still fail.
            except (URLError, TimeoutError, ConnectionResetError, json.JSONDecodeError):
                time.sleep(0.25)
        else:
            raise RuntimeError("Caddy did not become ready: " + docker("logs", cls.proxy))

    @classmethod
    def cleanup(cls):
        # Exact names are unique to this suite; never stop unrelated containers.
        for container in reversed(cls.containers):
            subprocess.run(["docker", "rm", "-f", "-v", container], check=False,
                           capture_output=True, timeout=30)
        subprocess.run(["docker", "network", "rm", cls.prefix], check=False,
                       capture_output=True, timeout=30)

    @classmethod
    def request(cls, path, *, data=None, headers=None):
        request = Request(cls.url + path, data=data,
                          headers={"Host": "localhost", **(headers or {})})
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, json.load(response)

    def test_native_login_reaches_backend_without_rewriting(self):
        payload = b'{"phone":"test-fixture","password":"fixture-only"}'
        status, _, result = self.request(
            "/api/v1/customer/auth/login?lang=uz", data=payload,
            headers={"Content-Type": "application/json", "Authorization": "Bearer fixture-only"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["upstream"], "backend")
        self.assertEqual(result["method"], "POST")
        self.assertEqual(result["path"], "/api/v1/customer/auth/login?lang=uz")
        self.assertEqual(result["body"], payload.decode())
        headers = {key.lower(): value for key, value in result["headers"].items()}
        self.assertEqual(headers["authorization"], "Bearer fixture-only")
        self.assertEqual(headers["content-type"], "application/json")

    def test_api_root_and_authenticated_resource_routes(self):
        for path in ("/api/v1", "/api/v1/", "/api/v1/mechanic/work?status=in_progress"):
            with self.subTest(path=path):
                status, _, result = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(result["upstream"], "backend")
                self.assertEqual(result["path"], path)

    def test_dashboard_bff_and_other_paths_stay_on_dashboard(self):
        for path in ("/", "/platform", "/mini", "/api/auth/login", "/api/proxy/customers",
                     "/api/v10/auth/me", "/api/v1evil", "/docs", "/openapi.json", "/health", "/ready"):
            with self.subTest(path=path):
                _, _, result = self.request(path)
                self.assertEqual(result["upstream"], "dashboard")
                self.assertEqual(result["path"], path)

    def test_upstream_unauthorized_response_is_preserved(self):
        status, headers, result = self.request("/api/v1/auth/me")
        self.assertEqual(status, 401)
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(result["upstream"], "backend")

    def test_security_headers_on_both_upstreams_and_errors(self):
        for path in ("/", "/api/v1/customer/auth/login", "/api/v1/auth/me"):
            with self.subTest(path=path):
                _, headers, _ = self.request(path)
                self.assertEqual(headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains")
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                self.assertEqual(headers["X-Frame-Options"], "SAMEORIGIN")
                self.assertEqual(headers["Referrer-Policy"], "strict-origin-when-cross-origin")
                self.assertIsNone(headers["Server"])

    def test_client_cannot_spoof_forwarded_identity(self):
        for path in ("/", "/api/v1/auth/me"):
            with self.subTest(path=path):
                _, _, result = self.request(path, headers={
                    "X-Forwarded-For": "198.51.100.77", "X-Forwarded-Proto": "https",
                    "X-Forwarded-Host": "attacker.example",
                })
                headers = {key.lower(): value for key, value in result["headers"].items()}
                self.assertNotIn("198.51.100.77", headers["x-forwarded-for"])
                self.assertEqual(headers["x-forwarded-proto"], "http")
                self.assertEqual(headers["x-forwarded-host"], "localhost")

    def test_production_https_configuration_validates(self):
        docker("exec", "-e", "DOMAIN=app.garageos.example", self.proxy,
               "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        serve_fixture(*sys.argv[2:])
    else:
        unittest.main(verbosity=2)
