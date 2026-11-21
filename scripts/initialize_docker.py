#!/usr/bin/env python3
"""Create private files for a new Linux Docker deployment, without printing secrets."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit


GATEWAY_UID = 10001
DATA_UID = 999
CADDY_UID = 1001
CADDY_GID = 118


def public_origin(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise argparse.ArgumentTypeError("public origin is not a valid HTTPS origin") from error
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or any(character.isspace() or ord(character) < 32 for character in value)
        or "\\" in value
    ):
        raise argparse.ArgumentTypeError("public origin must contain only an HTTPS host and port")
    hostname = parsed.hostname.encode("idna").decode("ascii").lower()
    if ":" in hostname:
        hostname = f"[{hostname}]"
    suffix = f":{port}" if port is not None and port != 443 else ""
    return f"https://{hostname}{suffix}"


def owner_login(value: str) -> str:
    if not value or value != value.strip() or len(value.encode("utf-8")) > 128:
        raise argparse.ArgumentTypeError("owner login must contain 1-128 UTF-8 bytes without surrounding spaces")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise argparse.ArgumentTypeError("owner login must not contain control characters")
    return value


def configuration(origin: str, login: str, owner_password: str, database_password: str, redis_password: str) -> dict:
    return {
        "schema_version": 1,
        "host": {
            "timezone": "Asia/Shanghai",
            "listen": {"host": "0.0.0.0", "port": 8080},
            "runtime_data_dir": "/app/.runtime/data",
            "worker_shutdown_timeout_seconds": 30,
            "logging": {
                "level": "info",
                "stdout": True,
                "file": {
                    "enabled": True,
                    "directory": "/app/.runtime/logs",
                    "retention_days": 7,
                    "max_file_size_mb": 100,
                },
                "oauth_recovery": False,
                "request_dump": False,
                "request_dump_retention_days": 1,
            },
            "system_update": {},
        },
        "store": {
            "provider_credential_key_file": "/app/deploy/provider-credentials.key",
            "database": {
                "url": "postgres://ovload@postgres:5432/ovload",
                "password": database_password,
            },
            "redis": {"url": "redis://redis:6379/0", "password": redis_password},
            "pool": {
                "max_connections": 20,
                "acquire_timeout_seconds": 5,
                "observability_timeout_seconds": 120,
            },
        },
        "admin": {
            "identity_notification_key_file": None,
            "session_ttl_minutes": 1440,
            "session_absolute_ttl_minutes": 43200,
            "default_username": login,
            "default_password": owner_password,
        },
        "api": {
            "identity_public_origin": origin,
            "asset_directory": "/app/web",
            "cors_allowed_origins": [],
            "request_timeout_seconds": None,
            "request_id_header": "x-request-id",
        },
    }


def write_private(path: Path, content: bytes, uid: int, mode: int = 0o400, gid: int | None = None) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(descriptor, "wb") as output:
        os.fchown(output.fileno(), uid, uid if gid is None else gid)
        os.fchmod(output.fileno(), mode)
        output.write(content)


def tls_material(hostname: str) -> dict[str, bytes]:
    """Generate a private local CA and an IP/DNS certificate without shell interpolation."""
    temporary = Path(tempfile.mkdtemp(prefix="ovload-tls-"))
    try:
        ca_key = temporary / "ca.key"
        ca_crt = temporary / "ca.crt"
        server_key = temporary / "server.key"
        server_csr = temporary / "server.csr"
        server_crt = temporary / "server.crt"
        serial = temporary / "ca.srl"
        extension = temporary / "server.ext"
        subject_name = "/CN=" + hostname
        san = f"IP:{hostname}" if _is_ip_address(hostname) else f"DNS:{hostname}"
        extension.write_text("subjectAltName=" + san + "\n", encoding="ascii")
        commands = (
            ["openssl", "req", "-x509", "-newkey", "rsa:4096", "-nodes", "-days", "3650", "-keyout", str(ca_key), "-out", str(ca_crt), "-subj", "/CN=OVLoad Gateway Local CA", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"],
            ["openssl", "genrsa", "-out", str(server_key), "2048"],
            ["openssl", "req", "-new", "-key", str(server_key), "-out", str(server_csr), "-subj", subject_name],
            ["openssl", "x509", "-req", "-in", str(server_csr), "-CA", str(ca_crt), "-CAkey", str(ca_key), "-CAcreateserial", "-CAserial", str(serial), "-out", str(server_crt), "-days", "825", "-sha256", "-extfile", str(extension)],
        )
        for command in commands:
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {
            "ca.crt": ca_crt.read_bytes(),
            "ca.key": ca_key.read_bytes(),
            "server.key": server_key.read_bytes(),
            "server-fullchain.crt": server_crt.read_bytes() + ca_crt.read_bytes(),
        }
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError("openssl is required to generate deployment TLS material") from error
    finally:
        shutil.rmtree(temporary, ignore_errors=True)


def _is_ip_address(hostname: str) -> bool:
    import ipaddress

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        return False
    return True


def initialize(directory: Path, origin: str, login: str) -> None:
    if not directory.is_absolute() or ".." in directory.parts:
        raise ValueError("private directory must be an absolute path without '..'")
    if directory.is_symlink():
        raise ValueError("private directory must not be a symbolic link")
    if directory.exists() and (not directory.is_dir() or any(directory.iterdir())):
        raise ValueError("private directory must be empty; existing deployment files are never overwritten")
    if not directory.parent.is_dir():
        raise ValueError("create the private directory's parent before initialization")
    directory.mkdir(mode=0o700, exist_ok=True)
    os.chmod(directory, 0o700)
    os.chown(directory, GATEWAY_UID, GATEWAY_UID)

    hostname = urlsplit(origin).hostname
    if not hostname:
        raise ValueError("public origin must include a hostname")
    certificate_files = tls_material(hostname)

    owner_password = secrets.token_urlsafe(32)
    database_password = secrets.token_urlsafe(32)
    redis_password = secrets.token_urlsafe(32)
    config = configuration(origin, login, owner_password, database_password, redis_password)
    files = (
        ("config.yaml", (json.dumps(config, indent=2) + "\n").encode("utf-8"), GATEWAY_UID),
        ("provider-credentials.key", secrets.token_bytes(32), GATEWAY_UID),
        ("owner-password", (owner_password + "\n").encode("ascii"), GATEWAY_UID),
        ("postgres-password", (database_password + "\n").encode("ascii"), DATA_UID),
        ("redis-password", (redis_password + "\n").encode("ascii"), DATA_UID),
        (
            "redis.conf",
            (
                "bind 0.0.0.0\nport 6379\nprotected-mode yes\ndir /data\n"
                "maxmemory 256mb\nmaxmemory-policy noeviction\n"
                f"appendonly yes\nrequirepass {redis_password}\n"
            ).encode("ascii"),
            DATA_UID,
        ),
    )
    for name, content, uid in files:
        write_private(directory / name, content, uid)
    tls_directory = directory / "tls"
    tls_directory.mkdir(mode=0o750)
    os.chown(tls_directory, CADDY_UID, CADDY_GID)
    os.chmod(tls_directory, 0o750)
    write_private(tls_directory / "ca.crt", certificate_files["ca.crt"], CADDY_UID, 0o444, CADDY_GID)
    write_private(tls_directory / "ca.key", certificate_files["ca.key"], GATEWAY_UID, 0o400, GATEWAY_UID)
    write_private(tls_directory / "server.key", certificate_files["server.key"], CADDY_UID, 0o400, CADDY_GID)
    write_private(tls_directory / "server-fullchain.crt", certificate_files["server-fullchain.crt"], CADDY_UID, 0o444, CADDY_GID)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--public-origin", type=public_origin, required=True)
    parser.add_argument("--owner-login", type=owner_login, default="admin")
    args = parser.parse_args()
    if sys.platform != "linux" or os.geteuid() != 0:
        parser.error("run this initializer as root on the Linux Docker server")
    try:
        initialize(args.directory, args.public_origin, args.owner_login)
    except (OSError, ValueError) as error:
        print(f"Initialization failed: {error}. No existing deployment file was overwritten.", file=sys.stderr)
        return 1
    print(f"Created private deployment files in {args.directory}")
    print(f"Initial owner password file: {args.directory / 'owner-password'}")
    print("After PostgreSQL is healthy, run from the source directory:")
    print(
        f"OVLOAD_CONFIG_DIRECTORY={shlex.quote(str(args.directory))} "
        + shlex.join(
            [
                "docker", "compose", "-f", "deploy/compose.yml", "run", "--rm", "gateway",
                "identity", "bootstrap-owner", args.owner_login,
                "--password-file", "/app/deploy/owner-password",
            ]
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
