"""Verify the provenance hashes of archived source reports."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "reports/source-archive/manifest.json").read_text())
for item in manifest["files"]:
    path = root / "reports/source-archive" / item["file"]
    if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
        raise SystemExit(f"Archived report changed: {item['file']}")
print(f"Verified {len(manifest['files'])} archived reports")
