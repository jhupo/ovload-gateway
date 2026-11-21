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

def workspace_packages(root, cargo):
    workspace = cargo.get("workspace", {})
    members = workspace.get("members", [])
    if "package" in cargo or not members:
        raise ValueError("Cargo.toml must declare a virtual workspace with explicit members")

    def expand(patterns):
        paths = set()
        for pattern in patterns:
            if not isinstance(pattern, str) or Path(pattern).is_absolute() or ".." in Path(pattern).parts:
                raise ValueError("Workspace member paths must stay inside the repository")
            matches = list(root.glob(pattern))
            if not matches:
                raise ValueError(f"Workspace path does not match a directory: {pattern}")
            for match in matches:
                path = match.resolve()
                if not path.is_relative_to(root.resolve()) or not path.is_dir():
                    raise ValueError(f"Invalid workspace member directory: {pattern}")
                paths.add(path)
        return paths

    manifests = expand(members) - expand(workspace.get("exclude", []))
    if not manifests:
        raise ValueError("Workspace must contain at least one package")
    packages = {}
    for directory in sorted(manifests):
        manifest = directory / "Cargo.toml"
        if not manifest.is_file():
            raise ValueError(f"Workspace member is missing Cargo.toml: {directory.relative_to(root.resolve())}")
        package = tomllib.loads(manifest.read_text(encoding="utf-8"))["package"]
        name = package["name"]
        if package.get("version") != {"workspace": True}:
            raise ValueError(f"Workspace package must inherit its version: {name}")
        if name in packages:
            raise ValueError(f"Duplicate workspace package name: {name}")
        packages[name] = workspace["package"]["version"]
    return packages

def check(root=ROOT, tag=None):
    version = validate_version((root / "VERSION").read_text(encoding="utf-8").strip())
    cargo = tomllib.loads((root / "Cargo.toml").read_text(encoding="utf-8"))
    package = json.loads((root / "web/package.json").read_text(encoding="utf-8"))
    if cargo.get("workspace", {}).get("package", {}).get("version") != version or package["version"] != version:
        raise ValueError("VERSION, workspace.package.version, and web/package.json must match")
    expected = workspace_packages(root, cargo)
    lock = tomllib.loads((root / "Cargo.lock").read_text(encoding="utf-8"))
    local_packages = [p for p in lock["package"] if "source" not in p]
    actual = {p["name"]: p["version"] for p in local_packages}
    if len(actual) != len(local_packages) or actual != expected:
        raise ValueError("Cargo.lock local packages must exactly match workspace package names and versions")
    if tag is not None:
        if tag != "v" + version:
            raise ValueError(f"Tag {tag!r} does not match v{version}")
        if f"## [{version}]" not in (root / "CHANGELOG.md").read_text(encoding="utf-8"):
            raise ValueError("Release requires a versioned CHANGELOG section")
    return version

def prepare(version):
    validate_version(version)
    check(root=ROOT)
    cargo_path = ROOT / "Cargo.toml"
    cargo = cargo_path.read_text(encoding="utf-8")
    cargo, changed = re.subn(
        r'(?ms)(^\[workspace\.package\]\s*\n(?:(?!^\[).)*?^version\s*=\s*)"[^"]+"',
        lambda match: match.group(1) + f'"{version}"',
        cargo,
        count=1,
    )
    if changed != 1:
        raise ValueError("Cannot locate workspace.package.version")
    package_path = ROOT / "web/package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    package["version"] = version
    cargo_path.write_text(cargo, encoding="utf-8")
    package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    (ROOT / "VERSION").write_text(version + "\n", encoding="utf-8")
    subprocess.run(["cargo", "metadata", "--offline", "--format-version", "1", "--no-deps"],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    check(root=ROOT)
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
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
                output.write(f"version={version}\nprerelease={'true' if '-' in version else 'false'}\n")
