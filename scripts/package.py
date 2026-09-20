"""Build a platform archive. Called only by tag packaging jobs."""
import os
from pathlib import Path
import shutil
import tempfile
from version import ROOT, check

version = check()
platform = os.environ["PLATFORM"]
allowed = {"linux-x86_64", "linux-aarch64", "windows-x86_64", "macos-aarch64"}
if platform not in allowed:
    raise ValueError("Unsupported release platform")
binary = "ovload-gateway.exe" if platform.startswith("windows") else "ovload-gateway"
name = f"ovload-gateway-{version}-{platform}"
output = ROOT / "release-assets"
output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as temporary:
    staging = Path(temporary) / name
    staging.mkdir()
    shutil.copy2(ROOT / "target/release" / binary, staging / binary)
    shutil.copytree(ROOT / "web/dist", staging / "web")
    for file in ["LICENSE", "COPYING", "THIRD_PARTY_NOTICES.md", "README.md", "VERSION"]:
        shutil.copy2(ROOT / file, staging / file)
    shutil.copy2(ROOT / "docs/DEPLOYMENT.md", staging / "DEPLOYMENT.md")
    shutil.copy2(ROOT / "docs/DATABASE.md", staging / "DATABASE.md")
    shutil.make_archive(str(output / name), "zip" if platform.startswith("windows") else "gztar",
                        root_dir=temporary, base_dir=name)
