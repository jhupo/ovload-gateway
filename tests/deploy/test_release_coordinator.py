import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.release import ReleaseCoordinator, ReleaseError, _exclusive_lock, _parser, validate_release


OLD = "ghcr.io/jhupo/ovload-gateway@sha256:" + "1" * 64
NEW = "ghcr.io/jhupo/ovload-gateway@sha256:" + "2" * 64


class FakeRunner:
    def __init__(self, deploy: Path):
        self.deploy = deploy
        self.events = []
        self.fail_migration = False
        self.fail_candidate_worker = False
        self.fail_candidate_ready = False
        self.fail_caddy_reload = False
        self.caddy_reload_attempts = 0
        self.slot_versions = {"api-blue": "1.0.0", "api-green": None}
        self.worker_image = OLD
        self.public_fail_version = None

    def run(self, argv, *, cwd=None, env=None, stdin=None, stdout=None):
        command = list(argv)
        self.events.append((command, dict(env or {})))
        if command[0] == "cosign":
            return self._result(command)
        if command[:2] == ["docker", "pull"]:
            return self._result(command)
        args = command[command.index("-f") + 2 :]
        env = env or {}
        if args[0] == "exec":
            service = args[2]
            operation = args[3]
            if service == "caddy" and operation == "caddy" and args[4] == "reload":
                self.caddy_reload_attempts += 1
                if self.fail_caddy_reload:
                    return self._result(command, 1, stderr=b"injected Caddy reload failure")
            if service == "postgres" and operation == "pg_dump":
                stdout.write(b"verified-postgres-archive")
            elif service == "postgres" and operation == "pg_restore":
                if stdin.read() != b"verified-postgres-archive":
                    return self._result(command, 1, stderr=b"invalid archive")
            elif operation == "curl":
                endpoint = args[-1]
                if service == "api-green" and endpoint.endswith("/readyz") and self.fail_candidate_ready:
                    return self._result(command, 1, stderr=b"candidate readiness failed")
                if endpoint.endswith("/healthz"):
                    payload = {
                        "status": "ok",
                        "service": "ovload-gateway",
                        "version": self.slot_versions.get(service),
                    }
                    return self._result(command, stdout=json.dumps(payload).encode())
            return self._result(command)
        if args[0] == "run":
            if args[-1] == "migrate" and self.fail_migration:
                return self._result(command, 1, stderr=b"injected migration failure")
            return self._result(command)
        if args[0] == "up":
            service = args[-1]
            if service in self.slot_versions:
                image = env.get(f"OVLOAD_{service.removeprefix('api-').upper()}_IMAGE", OLD)
                self.slot_versions[service] = "1.1.0" if image == NEW else "1.0.0"
            elif service == "worker":
                image = env.get("OVLOAD_WORKER_IMAGE", OLD)
                if image == NEW and self.fail_candidate_worker:
                    return self._result(command, 1, stderr=b"injected worker readiness failure")
                self.worker_image = image
            return self._result(command)
        if args[0] == "port":
            return self._result(command, stdout=b"127.0.0.1:8080\n")
        return self._result(command)

    @staticmethod
    def _result(command, returncode=0, stdout=b"", stderr=b""):
        return subprocess.CompletedProcess(command, returncode, stdout, stderr)


class FakePublicProbe:
    def __init__(self, runner: FakeRunner, route_path: Path):
        self.runner = runner
        self.route_path = route_path

    def __call__(self):
        route = self.route_path.read_text(encoding="utf-8")
        slot = "api-green" if "api-green" in route else "api-blue"
        version = self.runner.slot_versions[slot]
        if version == self.runner.public_fail_version:
            version = "unavailable"
        return {"status": "ok", "version": version}


class ReleaseCoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.deploy = Path(self.temp.name) / "deploy"
        (self.deploy / "caddy").mkdir(parents=True)
        (self.deploy / ".env").write_text("POSTGRES_PASSWORD=test-only\n", encoding="utf-8")
        self.route_path = self.deploy / "caddy" / "active.caddy"
        self.route_path.write_text(ReleaseCoordinator._route_contents("blue"), encoding="ascii")
        state_dir = self.deploy / "release-state"
        state_dir.mkdir()
        (state_dir / "state.json").write_text(
            json.dumps({"active_slot": "blue", "version": "1.0.0", "image": OLD, "worker_image": OLD}),
            encoding="utf-8",
        )
        (state_dir / "images.env").write_text(
            f"OVLOAD_BLUE_IMAGE={OLD}\nOVLOAD_GREEN_IMAGE={OLD}\nOVLOAD_WORKER_IMAGE={OLD}\n",
            encoding="ascii",
        )
        self.runner = FakeRunner(self.deploy)
        self.probe = FakePublicProbe(self.runner, self.route_path)
        self.coordinator = ReleaseCoordinator(
            self.deploy, self.runner, public_probe=self.probe, public_ready_probe=lambda: True, sleep=lambda _: None
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_release_orders_backup_migration_candidate_cutover_worker_and_drain(self):
        self.coordinator.release(NEW, "1.1.0")
        operations = [self._compose_args(command) for command, _ in self.runner.events if command[:2] == ["docker", "compose"]]
        kinds = [operation[0] for operation in operations]
        self.assertLess(kinds.index("exec"), kinds.index("run"))
        self.assertLess(kinds.index("run"), kinds.index("up"))
        self.assertTrue(any(args[-1] == "api-green" and args[0] == "up" for args in operations))
        self.assertTrue(any(args[0] == "stop" and args[-1] == "worker" for args in operations))
        self.assertTrue(all(args[args.index("--timeout") + 1] == "270" for args in operations if args[0] == "stop"))
        self.assertEqual("green", json.loads((self.deploy / "release-state" / "state.json").read_text())["active_slot"])
        self.assertIn("api-green:8080", self.route_path.read_text())
        self.assertFalse((self.deploy / "release-state" / "pending.json").exists())

    def test_release_drain_defaults_preserve_the_full_request_lifetime(self):
        args = _parser().parse_args(["release", "--image", NEW, "--version", "1.1.0"])
        self.assertEqual(270, args.drain)
        for drain in (0, 30, 249, True, "270"):
            with self.subTest(drain=drain), self.assertRaisesRegex(ReleaseError, "at least 250 seconds"):
                self.coordinator.release(NEW, "1.1.0", drain=drain)
        self.assertEqual([], self.runner.events)
        self.assertFalse((self.deploy / "release-state" / "pending.json").exists())

    def test_custom_drain_is_used_during_release_and_failure_recovery(self):
        self.runner.fail_candidate_worker = True
        with self.assertRaisesRegex(ReleaseError, "readiness failure"):
            self.coordinator.release(NEW, "1.1.0", drain=330)
        stops = [self._compose_args(command) for command, _ in self.runner.events
                 if command[:2] == ["docker", "compose"] and self._compose_args(command)[0] == "stop"]
        self.assertEqual({"worker", "api-green"}, {args[-1] for args in stops})
        self.assertTrue(all(args[args.index("--timeout") + 1] == "330" for args in stops))
        self.assertEqual("blue", self.coordinator.status()["active_slot"])

    def test_recovery_rejects_an_unsafe_pending_drain_before_container_work(self):
        pending = {
            "old_slot": "blue", "new_slot": "green", "old_version": "1.0.0", "new_version": "1.1.0",
            "old_image": OLD, "new_image": NEW, "old_worker_image": OLD, "drain_seconds": 249,
            "stage": "route_switched",
        }
        pending_path = self.deploy / "release-state" / "pending.json"
        pending_path.write_text(json.dumps(pending), encoding="utf-8")
        with self.assertRaisesRegex(ReleaseError, "invalid drain"):
            self.coordinator.recover()
        self.assertEqual([], self.runner.events)
        self.assertTrue(pending_path.exists())

    def test_migration_failure_leaves_old_route_and_api_active(self):
        self.runner.fail_migration = True
        with self.assertRaisesRegex(ReleaseError, "migration failure"):
            self.coordinator.release(NEW, "1.1.0")
        self.assertIn("api-blue:8080", self.route_path.read_text())
        self.assertEqual("blue", self.coordinator.status()["active_slot"])
        self.assertFalse((self.deploy / "release-state" / "pending.json").exists())
        self.assertFalse(any(self._compose_args(command)[0] == "stop" and self._compose_args(command)[-1] == "api-blue" for command, _ in self.runner.events if command[:2] == ["docker", "compose"]))

    def test_public_check_failure_routes_back_and_restarts_old_worker(self):
        self.runner.public_fail_version = "1.1.0"
        with self.assertRaisesRegex(ReleaseError, "did not serve release 1.1.0"):
            self.coordinator.release(NEW, "1.1.0")
        self.assertIn("api-blue:8080", self.route_path.read_text())
        self.assertEqual(OLD, self.runner.worker_image)
        self.assertEqual("blue", self.coordinator.status()["active_slot"])

    def test_worker_readiness_failure_returns_route_and_worker_to_old_release(self):
        self.runner.fail_candidate_worker = True
        with self.assertRaisesRegex(ReleaseError, "readiness failure"):
            self.coordinator.release(NEW, "1.1.0")
        self.assertIn("api-blue:8080", self.route_path.read_text())
        self.assertEqual(OLD, self.runner.worker_image)
        self.assertEqual("1.0.0", self.runner.slot_versions["api-blue"])
        self.assertEqual("blue", self.coordinator.status()["active_slot"])

    def test_candidate_readiness_failure_keeps_old_slot_routed(self):
        self.runner.fail_candidate_ready = True
        with self.assertRaisesRegex(ReleaseError, "readiness failed"):
            self.coordinator.release(NEW, "1.1.0")
        self.assertIn("api-blue:8080", self.route_path.read_text())
        self.assertEqual("blue", self.coordinator.status()["active_slot"])

    def test_caddy_reload_failure_keeps_old_live_config_and_restores_route_file(self):
        self.runner.fail_caddy_reload = True
        with self.assertRaisesRegex(ReleaseError, "reload failure"):
            self.coordinator.release(NEW, "1.1.0")
        self.assertGreaterEqual(self.runner.caddy_reload_attempts, 2)
        self.assertIn("api-blue:8080", self.route_path.read_text())
        self.assertEqual("blue", self.coordinator.status()["active_slot"])

    def test_unsigned_or_malformed_release_is_rejected_before_docker_work(self):
        self.runner.fail_migration = True
        with self.assertRaises(ReleaseError):
            self.coordinator.release("ghcr.io/jhupo/ovload-gateway:latest", "1.1.0")
        self.assertEqual([], self.runner.events)
        with self.assertRaises(ReleaseError):
            validate_release(NEW, "latest")

    def test_cosign_failure_prevents_backup_and_migration(self):
        class UnsignedRunner(FakeRunner):
            def run(self, argv, **kwargs):
                if argv[0] == "cosign":
                    self.events.append((list(argv), dict(kwargs.get("env") or {})))
                    return self._result(argv, 1, stderr=b"no signed attestation")
                return super().run(argv, **kwargs)

        runner = UnsignedRunner(self.deploy)
        coordinator = ReleaseCoordinator(
            self.deploy, runner, public_probe=self.probe, public_ready_probe=lambda: True, sleep=lambda _: None
        )
        with self.assertRaisesRegex(ReleaseError, "signed release image"):
            coordinator.release(NEW, "1.1.0")
        self.assertEqual(1, len(runner.events))
        self.assertEqual("cosign", runner.events[0][0][0])
        self.assertEqual("verify", runner.events[0][0][1])

    def test_release_checks_signature_and_provenance_for_the_exact_image_identity(self):
        self.coordinator.release(NEW, "1.1.0")
        verifications = [
            command
            for command, _ in self.runner.events
            if command[:2] == ["cosign", "verify"]
            or command[:2] == ["cosign", "verify-attestation"]
        ]
        expected_identity = (
            "https://github.com/jhupo/ovload-gateway/.github/workflows/"
            "release.yml@refs/tags/v1.1.0"
        )
        self.assertEqual(2, len(verifications))
        for command in verifications:
            self.assertIn("--certificate-identity", command)
            self.assertEqual(expected_identity, command[command.index("--certificate-identity") + 1])
            self.assertIn("--certificate-oidc-issuer", command)
            self.assertEqual(
                "https://token.actions.githubusercontent.com",
                command[command.index("--certificate-oidc-issuer") + 1],
            )
            self.assertEqual(NEW, command[-1])
        self.assertEqual("slsaprovenance1", verifications[1][verifications[1].index("--type") + 1])

    def test_release_lock_is_exclusive(self):
        lock = self.deploy / "release-state" / "release.lock"
        with _exclusive_lock(lock):
            with self.assertRaisesRegex(ReleaseError, "already holds"):
                with _exclusive_lock(lock):
                    self.fail("nested release lock unexpectedly succeeded")

    @staticmethod
    def _compose_args(command):
        return command[command.index("-f") + 2 :]


if __name__ == "__main__":
    unittest.main()
