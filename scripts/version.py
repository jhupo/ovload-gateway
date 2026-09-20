"""Validate or prepare the synchronized project version; never creates Git tags."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?")

def validate_version(value):
    if not SEMVER.fullmatch(value):
        raise ValueError(f"Invalid version: {value!r}; use X.Y.Z or X.Y.Z-rc.1")
    return value

def check(root=ROOT, tag=None):
    version = validate_version((root / "VERSION").read_text().strip())
    cargo = tomllib.loads((root / "Cargo.toml").read_text())
    package = json.loads((root / "web/package.json").read_text())
    if cargo["workspace"]["package"]["version"] != version or package["version"] != version:
        raise ValueError("VERSION, Cargo.toml, and web/package.json must match")
    lock = tomllib.loads((root / "Cargo.lock").read_text())
    for name in ("ovload-core", "ovload-server"):
        matches = [p for p in lock["package"] if p["name"] == name and "source" not in p]
        if len(matches) != 1 or matches[0]["version"] != version:
            raise ValueError(f"Cargo.lock version mismatch: {name}")
    if tag is not None:
        if tag != "v" + version:
            raise ValueError(f"Tag {tag!r} does not match v{version}")
        if f"## [{version}]" not in (root / "CHANGELOG.md").read_text():
            raise ValueError("Release requires a versioned CHANGELOG section")
    return version

def prepare(version):
    validate_version(version)
    check()
    cargo_path = ROOT / "Cargo.toml"
    cargo = cargo_path.read_text()
    cargo = re.sub(r'(?m)^version = "[^"]+"$', f'version = "{version}"', cargo, count=1)
    package_path = ROOT / "web/package.json"
    package = json.loads(package_path.read_text())
    package["version"] = version
    cargo_path.write_text(cargo)
    package_path.write_text(json.dumps(package, indent=2) + "\n")
    (ROOT / "VERSION").write_text(version + "\n")
    subprocess.run(["cargo", "metadata", "--offline", "--format-version", "1", "--no-deps"],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    print(f"Prepared {version}. Update CHANGELOG, inspect the diff, and run all checks. No tag was created.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["check", "prepare"])
    parser.add_argument("version", nargs="?")
    parser.add_argument("--tag")
    parser.add_argument("--github-output", action="store_true")
    args = parser.parse_args()
    if args.command == "prepare":
        if not args.version:
            parser.error("prepare requires a version")
        prepare(args.version)
    else:
        version = check(tag=args.tag)
        print(version)
        if args.github_output:
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"version={version}\nprerelease={'true' if '-' in version else 'false'}\n")
