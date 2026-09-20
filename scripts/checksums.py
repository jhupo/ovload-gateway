"""Generate SHA-256 checksums only after all expected release packages exist."""
import hashlib
from pathlib import Path

PLATFORMS = {"linux-x86_64", "linux-aarch64", "windows-x86_64", "macos-aarch64"}

def generate(root, version):
    expected = {
        f"ovload-gateway-{version}-{platform}" + (".zip" if platform.startswith("windows") else ".tar.gz")
        for platform in PLATFORMS
    }
    actual = {p.name for p in root.iterdir() if p.suffix == ".zip" or p.name.endswith(".tar.gz")}
    if actual != expected:
        raise ValueError(f"Package set mismatch; missing={expected - actual}, unexpected={actual - expected}")
    lines = []
    for name in sorted(expected):
        with (root / name).open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        lines.append(f"{digest}  {name}\n")
    (root / "SHA256SUMS").write_text("".join(lines), encoding="utf-8", newline="\n")

if __name__ == "__main__":
    from version import ROOT, check
    generate(ROOT / "release-assets", check())
