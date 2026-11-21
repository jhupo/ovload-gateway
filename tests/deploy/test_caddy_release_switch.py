"""Real-container test for continuous Caddy routing during an atomic slot switch.

Run with OVLOAD_RUN_DOCKER_RELEASE_TESTS=1 and a working Docker daemon. The test
uses real PostgreSQL and Redis containers plus HTTP slot fixtures; it does not
substitute for a test with two Ovload application image releases.
"""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from urllib.error import URLError
from urllib.request import urlopen
import uuid


ENABLED = os.environ.get("OVLOAD_RUN_DOCKER_RELEASE_TESTS") == "1"
AVAILABLE = shutil.which("docker") is not None
SERVER = (
    "from http.server import BaseHTTPRequestHandler, HTTPServer\n"
    "import json\n"
    "import os\n"
    "\n"
    "class Handler(BaseHTTPRequestHandler):\n"
    "    def do_GET(self):\n"
    "        failing = os.environ.get('FAIL_HEALTH') == '1' and self.path == '/healthz'\n"
    "        self.send_response(500 if failing else 200)\n"
    "        self.send_header('Content-Type', 'application/json')\n"
    "        self.end_headers()\n"
    "        body = {'status': 'ok', 'version': os.environ['RELEASE_VERSION']} if self.path == '/healthz' else {'status': 'ok'}\n"
    "        self.wfile.write(json.dumps(body).encode())\n"
    "\n"
    "    def log_message(self, *args):\n"
    "        pass\n"
    "\n"
    "HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()\n"
)


@unittest.skipUnless(ENABLED and AVAILABLE, "requires OVLOAD_RUN_DOCKER_RELEASE_TESTS=1 and Docker")
class CaddyReleaseSwitchTests(unittest.TestCase):
    def setUp(self):
        self.suffix = uuid.uuid4().hex[:10]
        self.network = f"ovload-release-test-{self.suffix}"
        self.names = [f"ovload-{role}-{self.suffix}" for role in ("postgres", "redis", "blue", "green", "caddy")]
        self.temp = tempfile.TemporaryDirectory(prefix="ovload-caddy-test-")
        self.root = Path(self.temp.name)
        self.active = self.root / "active"
        self.active.mkdir()
        (self.root / "Caddyfile").write_text(
            "{\n  admin 127.0.0.1:2019\n  auto_https off\n  persist_config off\n}\n"
            ":8080 {\n  import /etc/caddy/active/active.caddy\n}\n",
            encoding="ascii",
        )
        self._write_route("blue")
        self.port = self._reserve_port()
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.started = []
        self.network_created = False

    def tearDown(self):
        for name in self.started:
            subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if self.network_created:
            subprocess.run(["docker", "network", "rm", self.network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.temp.cleanup()

    def test_requests_survive_cutover_failed_candidate_rolls_back_and_state_containers_stay(self):
        self._docker("network", "create", self.network)
        self.network_created = True
        self._run_container(
            "postgres", "postgres:17.9-bookworm", "--network-alias", "postgres",
            "-e", "POSTGRES_USER=ovload", "-e", "POSTGRES_PASSWORD=test-only",
            "-e", "POSTGRES_DB=ovload", "--health-cmd", "pg_isready -U ovload -d ovload",
            "--health-interval", "1s", "--health-timeout", "2s", "--health-retries", "30",
        )
        self._run_container(
            "redis", "redis:7.4.8-bookworm", "--network-alias", "redis",
            "--health-cmd", "redis-cli ping", "--health-interval", "1s", "--health-timeout", "2s",
            "--health-retries", "30",
        )
        self._run_container(
            "blue", "python:3.12-alpine", "--network-alias", "api-blue",
            "-e", "RELEASE_VERSION=1.0.0", "-e", "FAIL_HEALTH=0", "python", "-u", "-c", SERVER,
        )
        self._run_container(
            "green", "python:3.12-alpine", "--network-alias", "api-green",
            "-e", "RELEASE_VERSION=1.1.0", "-e", "FAIL_HEALTH=0", "python", "-u", "-c", SERVER,
        )
        self._run_container(
            "caddy", "caddy:2.10.2-alpine", "-p", f"127.0.0.1:{self.port}:8080",
            "-v", f"{self.root / 'Caddyfile'}:/etc/caddy/Caddyfile:ro",
            "-v", f"{self.active}:/etc/caddy/active:ro",
            "caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile",
        )
        self._wait_healthy("postgres")
        self._wait_healthy("redis")
        self._wait_response("1.0.0")
        state_ids = {role: self._container_id(role) for role in ("postgres", "redis")}

        failures = []
        stop = threading.Event()

        def request_loop():
            while not stop.is_set():
                try:
                    with urlopen(self.base_url + "/healthz", timeout=2) as response:
                        payload = json.loads(response.read().decode("utf-8"))
                        if response.status != 200 or payload["version"] not in {"1.0.0", "1.1.0"}:
                            failures.append((response.status, payload))
                except (URLError, TimeoutError, OSError) as exc:
                    failures.append(str(exc))

        requests = threading.Thread(target=request_loop, daemon=True)
        requests.start()
        self._write_route("green")
        self._reload_caddy()
        self._wait_response("1.1.0")
        time.sleep(1)
        stop.set()
        requests.join(timeout=3)
        self.assertEqual([], failures)

        failed_name = f"ovload-green-failing-{self.suffix}"
        self.names.append(failed_name)
        self._docker(
            "run", "-d", "--name", failed_name, "--network", self.network, "--network-alias", "api-green-failing",
            "-e", "RELEASE_VERSION=1.1.1", "-e", "FAIL_HEALTH=1", "python:3.12-alpine", "python", "-u", "-c", SERVER,
        )
        self.started.append(failed_name)
        self._write_route("green-failing")
        self._reload_caddy()
        self._wait_status(500)
        self._write_route("blue")
        self._reload_caddy()
        self._wait_response("1.0.0")
        self.assertEqual(state_ids, {role: self._container_id(role) for role in ("postgres", "redis")})

    def _run_container(self, role, image, *args):
        name = self.names[("postgres", "redis", "blue", "green", "caddy").index(role)]
        self._docker("run", "-d", "--name", name, "--network", self.network, *args, image)
        self.started.append(name)

    def _docker(self, *args, check=True):
        result = subprocess.run(["docker", *args], capture_output=True, text=True, check=False)
        if check and result.returncode:
            self.fail(f"docker {' '.join(args)} failed: {result.stderr.strip()}")
        return result

    def _container_id(self, role):
        name = self.names[("postgres", "redis", "blue", "green", "caddy").index(role)]
        return self._docker("inspect", "--format", "{{.Id}}", name).stdout.strip()

    def _wait_healthy(self, role):
        name = self.names[("postgres", "redis", "blue", "green", "caddy").index(role)]
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            status = self._docker("inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}", name).stdout.strip()
            if status == "healthy":
                return
            time.sleep(0.5)
        self.fail(f"{role} did not become healthy")

    def _wait_response(self, version):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                with urlopen(self.base_url + "/healthz", timeout=2) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                    if response.status == 200 and payload["version"] == version:
                        return
            except (URLError, TimeoutError, OSError):
                time.sleep(0.25)
        self.fail(f"Caddy did not route to version {version}")

    def _wait_status(self, expected):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                with urlopen(self.base_url + "/healthz", timeout=2) as response:
                    if response.status == expected:
                        return
            except Exception as exc:
                if getattr(exc, "code", None) == expected:
                    return
                time.sleep(0.25)
        self.fail(f"candidate route did not return expected status {expected}")

    def _reload_caddy(self):
        name = self.names[4]
        self._docker("exec", name, "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")

    def _write_route(self, slot):
        upstream = {"blue": "api-blue", "green": "api-green", "green-failing": "api-green-failing"}[slot]
        temporary = self.active / ".active.caddy.tmp"
        temporary.write_text(f"reverse_proxy {upstream}:8080\n", encoding="ascii")
        temporary.replace(self.active / "active.caddy")

    @staticmethod
    def _reserve_port():
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]


if __name__ == "__main__":
    unittest.main()
