"""Coordinate a digest-pinned, single-host blue/green Docker release."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from typing import BinaryIO, Iterator, Mapping, Sequence
from urllib.error import URLError
from urllib.request import urlopen

if os.name == "nt":
    import msvcrt
else:
    import fcntl


ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy"
IMAGE = "ghcr.io/jhupo/ovload-gateway"
ISSUER = "https://token.actions.githubusercontent.com"
SLSA_PREDICATE = "slsaprovenance1"
SLOTS = {"blue": "api-blue", "green": "api-green"}
DEFAULT_DRAIN_SECONDS = 270
MIN_DRAIN_SECONDS = 250
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
VERSION_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$"
)


class ReleaseError(RuntimeError):
    pass


class CommandRunner:
    def run(
        self,
        argv: Sequence[str],
        *,
        cwd: Path | None = None,
        env: Mapping[str, str] | None = None,
        stdin: BinaryIO | None = None,
        stdout: BinaryIO | None = None,
    ) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            list(argv),
            cwd=cwd,
            env=dict(env) if env is not None else None,
            stdin=stdin,
            stdout=stdout if stdout is not None else subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )


def validate_release(image_ref: str, version: str) -> None:
    if not VERSION_RE.fullmatch(version):
        raise ReleaseError("Version must be a full X.Y.Z release version")
    prefix = IMAGE + "@"
    if not image_ref.startswith(prefix) or not DIGEST_RE.fullmatch(image_ref[len(prefix) :]):
        raise ReleaseError(f"Image must use {IMAGE}@sha256:<64 lowercase hex characters>")


def validate_drain(drain: int) -> None:
    if isinstance(drain, bool) or not isinstance(drain, int) or drain < MIN_DRAIN_SECONDS:
        raise ReleaseError(f"Drain must be at least {MIN_DRAIN_SECONDS} seconds to preserve admitted requests")


def _atomic_write(path: Path, contents: bytes, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(contents)
            output.flush()
            os.fsync(output.fileno())
        if os.name != "nt":
            temp_path.chmod(mode)
        os.replace(temp_path, path)
        if os.name != "nt":
            dir_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
    finally:
        temp_path.unlink(missing_ok=True)


@contextmanager
def _exclusive_lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        path.parent.chmod(0o700)
    with path.open("a+b") as lock_file:
        try:
            if os.name == "nt":
                lock_file.seek(0, os.SEEK_END)
                if lock_file.tell() == 0:
                    lock_file.write(b"0")
                    lock_file.flush()
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError) as exc:
            raise ReleaseError("Another release or recovery already holds the release lock") from exc
        try:
            yield
        finally:
            if os.name == "nt":
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


class Compose:
    def __init__(self, deploy_dir: Path, runner: CommandRunner):
        self.deploy_dir = deploy_dir
        self.runner = runner
        self.images_path = deploy_dir / "release-state" / "images.env"

    def run(
        self,
        *args: str,
        overrides: Mapping[str, str] | None = None,
        profiles: Sequence[str] = (),
        stdin: BinaryIO | None = None,
        stdout: BinaryIO | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[bytes]:
        command = [
            "docker",
            "compose",
            "--project-directory",
            str(self.deploy_dir),
            "--env-file",
            str(self.deploy_dir / ".env"),
        ]
        if self.images_path.exists():
            command.extend(["--env-file", str(self.images_path)])
        for profile in profiles:
            command.extend(["--profile", profile])
        command.extend(["-f", str(self.deploy_dir / "compose.yml"), *args])
        env = os.environ.copy()
        if overrides:
            env.update(overrides)
        result = self.runner.run(command, cwd=self.deploy_dir, env=env, stdin=stdin, stdout=stdout)
        if check and result.returncode:
            output = (result.stderr or b"").decode("utf-8", errors="replace").strip()
            raise ReleaseError(f"docker compose {' '.join(args)} failed: {output}")
        return result


class ReleaseCoordinator:
    def __init__(
        self,
        deploy_dir: Path = DEPLOY,
        runner: CommandRunner | None = None,
        public_probe=None,
        public_ready_probe=None,
        sleep=time.sleep,
    ):
        self.deploy_dir = deploy_dir.resolve()
        self.runner = runner or CommandRunner()
        self.compose = Compose(self.deploy_dir, self.runner)
        self.state_dir = self.deploy_dir / "release-state"
        self.state_path = self.state_dir / "state.json"
        self.pending_path = self.state_dir / "pending.json"
        self.route_path = self.deploy_dir / "caddy" / "active.caddy"
        self.lock_path = self.state_dir / "release.lock"
        self.public_probe = public_probe or self._probe_public
        self.public_ready_probe = public_ready_probe or self._probe_public_ready
        self.sleep = sleep

    def verify_image(self, image_ref: str, version: str) -> None:
        validate_release(image_ref, version)
        identity = (
            "https://github.com/jhupo/ovload-gateway/.github/workflows/"
            f"release.yml@refs/tags/v{version}"
        )
        verification = [
            "--certificate-identity",
            identity,
            "--certificate-oidc-issuer",
            ISSUER,
            image_ref,
        ]
        self._run(
            ["cosign", "verify", *verification],
            "Verify the signed release image",
        )
        self._run(
            [
                "cosign",
                "verify-attestation",
                "--type",
                SLSA_PREDICATE,
                *verification,
            ],
            "Verify the signed release provenance",
        )
        self._run(["docker", "pull", image_ref], "Pull the immutable release image")

    def install(self, image_ref: str, version: str) -> None:
        self.verify_image(image_ref, version)
        with _exclusive_lock(self.lock_path):
            if self.state_path.exists():
                raise ReleaseError("Deployment is already initialized; use release instead")
            self._write_images({"blue": image_ref, "green": image_ref, "worker": image_ref})
            self._write_route("blue")
            self.compose.run("up", "-d", "--wait", "postgres", "redis")
            self.compose.run("run", "--rm", "--no-deps", "api-blue", "migrate", profiles=("api-blue",))
            self.compose.run("up", "-d", "--no-deps", "--wait", "api-blue", profiles=("api-blue",))
            self.compose.run("up", "-d", "--no-deps", "--wait", "worker", profiles=("worker",))
            self.compose.run("up", "-d", "--no-deps", "--wait", "caddy")
            self._verify_slot("blue", version)
            self._verify_public(version)
            self._write_state(
                {"active_slot": "blue", "version": version, "image": image_ref, "worker_image": image_ref}
            )

    def release(self, image_ref: str, version: str, timeout: int = 120, drain: int = DEFAULT_DRAIN_SECONDS) -> None:
        validate_drain(drain)
        self.verify_image(image_ref, version)
        with _exclusive_lock(self.lock_path):
            state = self._read_state()
            if self.pending_path.exists():
                raise ReleaseError("An interrupted release needs `recover` before another release")
            old_slot = state["active_slot"]
            if state["version"] == version or state["image"] == image_ref:
                raise ReleaseError("The requested release is already active")
            new_slot = "green" if old_slot == "blue" else "blue"
            old_image = state["image"]
            old_worker = state["worker_image"]
            new_state_images = self._read_images()
            new_state_images[new_slot] = image_ref
            old_public = self.route_path.read_text(encoding="utf-8").strip()
            if old_public != self._route_contents(old_slot).strip():
                raise ReleaseError("Caddy route and recorded active slot disagree; run recover and inspect state")
            pending = {
                "old_slot": old_slot,
                "new_slot": new_slot,
                "old_version": state["version"],
                "new_version": version,
                "old_image": old_image,
                "new_image": image_ref,
                "old_worker_image": old_worker,
                "drain_seconds": drain,
                "stage": "prepared",
            }
            _atomic_write(self.pending_path, json.dumps(pending, sort_keys=True).encode("utf-8") + b"\n")
            try:
                self._backup_and_validate()
                self.compose.run(
                    "run", "--rm", "--no-deps", SLOTS[new_slot], "migrate",
                    overrides={self._slot_env(new_slot): image_ref},
                    profiles=(SLOTS[new_slot],),
                )
                self._set_stage(pending, "migrated")
                self.compose.run(
                    "up", "-d", "--no-deps", "--wait", "--wait-timeout", str(timeout), SLOTS[new_slot],
                    overrides={self._slot_env(new_slot): image_ref},
                    profiles=(SLOTS[new_slot],),
                )
                self._verify_slot(new_slot, version)
                self._set_stage(pending, "candidate_ready")
                self._write_route(new_slot)
                self.compose.run("exec", "-T", "caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")
                self._set_stage(pending, "route_switched")
                self._verify_public(version)
                self._set_stage(pending, "public_verified")
                self.compose.run("stop", "--timeout", str(drain), "worker", profiles=("worker",))
                self._set_stage(pending, "old_worker_stopped")
                self.compose.run(
                    "up", "-d", "--no-deps", "--wait", "--wait-timeout", str(timeout), "worker",
                    overrides={"OVLOAD_WORKER_IMAGE": image_ref},
                    profiles=("worker",),
                )
                self._set_stage(pending, "candidate_worker_ready")
                new_state_images["worker"] = image_ref
                self._write_images(new_state_images)
                self._write_state(
                    {"active_slot": new_slot, "version": version, "image": image_ref, "worker_image": image_ref}
                )
                self.pending_path.unlink(missing_ok=True)
            except Exception as exc:
                try:
                    self._recover_locked(pending)
                except Exception as recovery_error:
                    raise ReleaseError(
                        f"Release failed ({exc}); automatic recovery also failed ({recovery_error}). "
                        "Both API slots were retained; inspect status and run recover."
                    ) from recovery_error
                if isinstance(exc, ReleaseError):
                    raise
                raise ReleaseError(f"Release failed and was rolled back: {exc}") from exc
            self.compose.run("stop", "--timeout", str(drain), SLOTS[old_slot], profiles=(SLOTS[old_slot],), check=False)

    def recover(self) -> None:
        with _exclusive_lock(self.lock_path):
            if not self.pending_path.exists():
                raise ReleaseError("No interrupted release is recorded")
            pending = json.loads(self.pending_path.read_text(encoding="utf-8"))
            self._recover_locked(pending)

    def status(self) -> dict[str, str]:
        state = self._read_state()
        state["route"] = self.route_path.read_text(encoding="utf-8").strip()
        state["pending"] = "true" if self.pending_path.exists() else "false"
        return state

    def _recover_locked(self, pending: dict[str, str | int]) -> None:
        self._validate_pending(pending)
        old_slot = pending["old_slot"]
        new_slot = pending["new_slot"]
        images = self._read_images()
        images[old_slot] = pending["old_image"]
        images[new_slot] = pending["new_image"]
        images["worker"] = pending["old_worker_image"]
        self._write_images(images)
        self._write_route(old_slot)
        self.compose.run("up", "-d", "--no-deps", "--wait", SLOTS[old_slot], overrides={self._slot_env(old_slot): pending["old_image"]}, profiles=(SLOTS[old_slot],))
        try:
            self.compose.run("exec", "-T", "caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")
        except ReleaseError:
            if not self._public_serves(pending["old_version"]):
                raise
        self._verify_slot(old_slot, pending["old_version"])
        self.compose.run("up", "-d", "--no-deps", "--wait", "worker", overrides={"OVLOAD_WORKER_IMAGE": pending["old_worker_image"]}, profiles=("worker",))
        self._verify_public(pending["old_version"])
        self.compose.run("stop", "--timeout", str(pending["drain_seconds"]), SLOTS[new_slot], profiles=(SLOTS[new_slot],), check=False)
        self._write_state(
            {
                "active_slot": old_slot,
                "version": pending["old_version"],
                "image": pending["old_image"],
                "worker_image": pending["old_worker_image"],
            }
        )
        self.pending_path.unlink(missing_ok=True)

    @staticmethod
    def _validate_pending(pending: dict[str, str | int]) -> None:
        old_slot = pending.get("old_slot")
        new_slot = pending.get("new_slot")
        if old_slot not in SLOTS or new_slot not in SLOTS or new_slot == old_slot:
            raise ReleaseError("Pending release has invalid API slots; both slots were left running")
        try:
            validate_drain(pending["drain_seconds"])
        except (KeyError, ReleaseError) as exc:
            raise ReleaseError("Pending release has an invalid drain; both slots were left running") from exc
        try:
            validate_release(pending["old_image"], pending["old_version"])
            validate_release(pending["new_image"], pending["new_version"])
            validate_release(pending["old_worker_image"], pending["old_version"])
        except (KeyError, ReleaseError) as exc:
            raise ReleaseError("Pending release is malformed; both slots were left running") from exc

    def _backup_and_validate(self) -> Path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup = self.deploy_dir / "backups" / f"release-{timestamp}.dump"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if os.name != "nt":
            backup.parent.chmod(0o700)
        partial = backup.with_suffix(backup.suffix + ".partial")
        with partial.open("xb") as output:
            self.compose.run(
                "exec", "-T", "postgres", "pg_dump", "-U", "ovload", "-d", "ovload",
                "--format=custom", "--no-owner", "--no-acl", stdout=output,
            )
            output.flush()
            os.fsync(output.fileno())
        if os.name != "nt":
            partial.chmod(0o600)
        if partial.stat().st_size == 0:
            raise ReleaseError("PostgreSQL backup is empty")
        with partial.open("rb") as archive:
            self.compose.run("exec", "-T", "postgres", "pg_restore", "--list", stdin=archive)
        os.replace(partial, backup)
        if os.name != "nt":
            dir_fd = os.open(backup.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        return backup

    def _verify_slot(self, slot: str, version: str) -> None:
        service = SLOTS[slot]
        self._probe(service, "/readyz")
        payload = self._probe(service, "/healthz")
        if payload.get("version") != version or payload.get("status") != "ok":
            raise ReleaseError(f"{service} reports unexpected version or health status: {payload!r}")

    def _probe(self, service: str, path: str) -> dict[str, str]:
        result = self.compose.run(
            "exec", "-T", service, "curl", "--fail", "--silent", "--show-error",
            f"http://127.0.0.1:8080{path}",
            profiles=(service,),
        )
        if path == "/readyz":
            return {"status": "ok"}
        try:
            payload = json.loads((result.stdout or b"").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ReleaseError(f"{service} returned invalid {path} JSON") from exc
        return payload

    def _verify_public(self, version: str) -> None:
        last_error = None
        for _ in range(10):
            try:
                payload = self.public_probe()
                if (
                    payload.get("version") == version
                    and payload.get("status") == "ok"
                    and self.public_ready_probe()
                ):
                    return
                last_error = f"Caddy served unexpected health payload {payload!r}"
            except Exception as exc:  # A short retry window covers Caddy's graceful reload.
                last_error = str(exc)
            self.sleep(0.25)
        raise ReleaseError(f"Caddy did not serve release {version}: {last_error}")

    def _public_serves(self, version: str) -> bool:
        try:
            payload = self.public_probe()
            return (
                payload.get("version") == version
                and payload.get("status") == "ok"
                and self.public_ready_probe()
            )
        except Exception:
            return False

    def _probe_public(self) -> dict[str, str]:
        endpoint = self._public_endpoint()
        with urlopen(f"http://{endpoint}/healthz", timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))

    def _probe_public_ready(self) -> bool:
        endpoint = self._public_endpoint()
        with urlopen(f"http://{endpoint}/readyz", timeout=2) as response:
            return response.status == 200

    def _public_endpoint(self) -> str:
        result = self.compose.run("port", "caddy", "8080")
        endpoint = (result.stdout or b"").decode("utf-8").strip().splitlines()[0]
        return endpoint

    def _run(self, argv: Sequence[str], description: str) -> None:
        result = self.runner.run(argv, cwd=ROOT, env=os.environ.copy())
        if result.returncode:
            detail = (result.stderr or b"").decode("utf-8", errors="replace").strip()
            raise ReleaseError(f"{description} failed: {detail}")

    def _read_state(self) -> dict[str, str]:
        if not self.state_path.exists():
            raise ReleaseError("Deployment is not initialized; run install first")
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        if state.get("active_slot") not in SLOTS:
            raise ReleaseError("Release state has an invalid active slot")
        try:
            validate_release(state["image"], state["version"])
            validate_release(state["worker_image"], state["version"])
        except (KeyError, ReleaseError) as exc:
            raise ReleaseError("Release state is malformed or not digest-pinned") from exc
        return state

    def _read_images(self) -> dict[str, str]:
        if not self.compose.images_path.exists():
            raise ReleaseError("Managed image file is missing; recover deployment state before proceeding")
        values = {}
        for line in self.compose.images_path.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            key, separator, value = line.partition("=")
            if not separator:
                raise ReleaseError("Managed image file is malformed")
            values[key] = value
        try:
            images = {
                "blue": values["OVLOAD_BLUE_IMAGE"],
                "green": values["OVLOAD_GREEN_IMAGE"],
                "worker": values["OVLOAD_WORKER_IMAGE"],
            }
            for image in images.values():
                validate_release(image, "0.0.0")
        except (KeyError, ReleaseError) as exc:
            raise ReleaseError("Managed image pins are malformed or not digest-pinned") from exc
        return images

    def _write_images(self, images: Mapping[str, str]) -> None:
        data = (
            f"OVLOAD_BLUE_IMAGE={images['blue']}\n"
            f"OVLOAD_GREEN_IMAGE={images['green']}\n"
            f"OVLOAD_WORKER_IMAGE={images['worker']}\n"
        ).encode("ascii")
        _atomic_write(self.compose.images_path, data)

    def _write_state(self, state: dict[str, str]) -> None:
        _atomic_write(self.state_path, json.dumps(state, sort_keys=True).encode("utf-8") + b"\n")

    def _write_route(self, slot: str) -> None:
        if slot not in SLOTS:
            raise ReleaseError("Refusing to write an unknown Caddy upstream")
        _atomic_write(self.route_path, self._route_contents(slot).encode("ascii"), mode=0o644)

    @staticmethod
    def _route_contents(slot: str) -> str:
        return f"reverse_proxy {SLOTS[slot]}:8080 {{\n\tflush_interval -1\n}}\n"

    @staticmethod
    def _slot_env(slot: str) -> str:
        return f"OVLOAD_{slot.upper()}_IMAGE"

    def _set_stage(self, pending: dict[str, str | int], stage: str) -> None:
        pending["stage"] = stage
        _atomic_write(self.pending_path, json.dumps(pending, sort_keys=True).encode("utf-8") + b"\n")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage verified blue/green Ovload releases")
    parser.add_argument("--deploy-dir", type=Path, default=DEPLOY)
    commands = parser.add_subparsers(dest="command", required=True)
    install = commands.add_parser("install")
    install.add_argument("--image", required=True)
    install.add_argument("--version", required=True)
    release = commands.add_parser("release")
    release.add_argument("--image", required=True)
    release.add_argument("--version", required=True)
    release.add_argument("--timeout", type=int, default=120)
    release.add_argument("--drain", type=int, default=DEFAULT_DRAIN_SECONDS)
    commands.add_parser("recover")
    commands.add_parser("status")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    coordinator = ReleaseCoordinator(args.deploy_dir)
    try:
        if args.command == "install":
            coordinator.install(args.image, args.version)
        elif args.command == "release":
            coordinator.release(args.image, args.version, args.timeout, args.drain)
        elif args.command == "recover":
            coordinator.recover()
        else:
            print(json.dumps(coordinator.status(), indent=2, sort_keys=True))
    except (ReleaseError, OSError, URLError, json.JSONDecodeError) as exc:
        print(f"release error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
