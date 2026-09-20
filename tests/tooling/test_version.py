import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("version", Path(__file__).resolve().parents[2] / "scripts/version.py")
version = importlib.util.module_from_spec(spec)
spec.loader.exec_module(version)

class VersionTests(unittest.TestCase):
    def test_valid_release_versions(self):
        for item in ["0.1.0", "1.2.3", "1.2.3-rc.1"]:
            self.assertEqual(item, version.validate_version(item))

    def test_invalid_versions_cannot_become_release_tags(self):
        for item in ["v1.0.0", "01.0.0", "1.0", "1.0.0-01", "1.0.0\n", "1.0.0;echo x"]:
            with self.subTest(item=item), self.assertRaises(ValueError):
                version.validate_version(item)

    def test_mismatched_tag_rejected(self):
        with self.assertRaises(ValueError):
            version.check(tag="v999.0.0")

    def test_actual_version_is_consistent(self):
        self.assertEqual(version.check(), (version.ROOT / "VERSION").read_text().strip())

    def test_manifest_drift_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "web").mkdir()
            (root / "VERSION").write_text("1.2.3")
            (root / "Cargo.toml").write_text('[workspace.package]\nversion="1.2.3"\n')
            (root / "web/package.json").write_text('{"version":"1.2.4"}')
            with self.assertRaises(ValueError):
                version.check(root=root)
