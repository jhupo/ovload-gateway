import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("checksums", Path(__file__).resolve().parents[2] / "scripts/checksums.py")
checksums = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checksums)

class ChecksumTests(unittest.TestCase):
    def test_incomplete_release_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                checksums.generate(Path(directory), "1.0.0")

    def test_complete_release_has_verifiable_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for platform in checksums.PLATFORMS:
                suffix = ".zip" if platform.startswith("windows") else ".tar.gz"
                (root / f"ovload-gateway-1.0.0-{platform}{suffix}").write_bytes(platform.encode())
            checksums.generate(root, "1.0.0")
            lines = (root / "SHA256SUMS").read_text().splitlines()
            self.assertEqual(len(lines), 4)
            for line in lines:
                digest, name = line.split("  ", 1)
                self.assertEqual(digest, hashlib.sha256((root / name).read_bytes()).hexdigest())
            (root / "unexpected.zip").write_bytes(b"unexpected")
            with self.assertRaises(ValueError):
                checksums.generate(root, "1.0.0")
