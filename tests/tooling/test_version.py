import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("version", Path(__file__).resolve().parents[2] / "scripts/version.py")
version = importlib.util.module_from_spec(spec)
spec.loader.exec_module(version)

class VersionTests(unittest.TestCase):
    def workspace(self, root, members='["src/apps", "src/crates/*"]'):
        (root / "web").mkdir()
        (root / "VERSION").write_text("1.2.3")
        (root / "Cargo.toml").write_text(
            f'[workspace]\nmembers={members}\n'
            '[workspace.dependencies]\nserde="1"\n'
            '[workspace.package]\nversion="1.2.3"\n'
        )
        (root / "web/package.json").write_text('{"version":"1.2.3"}')
        for path, name in [("src/apps", "ovload-gateway"), ("src/crates/core", "ovload-core")]:
            directory = root / path
            directory.mkdir(parents=True)
            (directory / "Cargo.toml").write_text(
                f'[package]\nname="{name}"\nversion.workspace=true\n'
                '# UTF-8 fixture: \u6570\u636e\u5e93\n',
                encoding="utf-8",
            )
        self.lock(root)

    def lock(self, root, packages=None):
        if packages is None:
            packages = [("ovload-gateway", "1.2.3"), ("ovload-core", "1.2.3")]
        (root / "Cargo.lock").write_text(
            "".join(f'[[package]]\nname="{name}"\nversion="{value}"\n' for name, value in packages)
            + '[[package]]\nname="serde"\nversion="1.0.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"\n'
        )

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
            self.workspace(root)
            (root / "web/package.json").write_text('{"version":"1.2.4"}')
            with self.assertRaises(ValueError):
                version.check(root=root)

    def test_workspace_lock_requires_all_member_names_and_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.workspace(root)
            self.assertEqual(version.check(root=root), "1.2.3")
            for packages in [
                [("ovload-gateway", "1.2.3")],
                [("ovload-gateway", "1.2.3"), ("ovload-core", "1.2.4")],
                [("ovload-gateway", "1.2.3"), ("ovload-server", "1.2.3")],
                [("ovload-gateway", "1.2.3"), ("ovload-core", "1.2.3"), ("extra-local", "1.2.3")],
                [("ovload-gateway", "1.2.3"), ("ovload-core", "1.2.3"), ("ovload-core", "1.2.3")],
            ]:
                self.lock(root, packages)
                with self.subTest(packages=packages), self.assertRaises(ValueError):
                    version.check(root=root)

    def test_every_member_must_inherit_the_workspace_version(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.workspace(root)
            member = root / "src/crates/core/Cargo.toml"
            for declaration in ['version="1.2.3"', 'version.workspace=false']:
                member.write_text(f'[package]\nname="ovload-core"\n{declaration}\n')
                with self.subTest(declaration=declaration), self.assertRaises(ValueError):
                    version.check(root=root)

    def test_excluded_directories_are_not_local_packages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.workspace(root)
            excluded = root / "src/crates/fixture"
            excluded.mkdir()
            manifest = root / "Cargo.toml"
            manifest.write_text(manifest.read_text().replace(
                '[workspace]\n', '[workspace]\nexclude=["src/crates/fixture"]\n'
            ))
            self.assertEqual(version.check(root=root), "1.2.3")

    def test_missing_members_and_duplicate_names_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.workspace(root, '["src/apps", "src/missing"]')
            with self.assertRaises(ValueError):
                version.check(root=root)
            manifest = root / "Cargo.toml"
            manifest.write_text(manifest.read_text().replace('"src/missing"', '"src/crates/core"'))
            core = root / "src/crates/core/Cargo.toml"
            core.write_text(
                core.read_text(encoding="utf-8").replace('"ovload-core"', '"ovload-gateway"'),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                version.check(root=root)

    def test_prepare_changes_shared_version_and_updates_all_local_lock_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.workspace(root)

            def metadata(*args, **kwargs):
                self.assertEqual(kwargs["cwd"], root)
                self.assertEqual(args[0], ["cargo", "metadata", "--offline", "--format-version", "1", "--no-deps"])
                self.lock(root, [("ovload-gateway", "2.0.0"), ("ovload-core", "2.0.0")])

            with patch.object(version, "ROOT", root), patch.object(version.subprocess, "run", side_effect=metadata):
                version.prepare("2.0.0")
            self.assertEqual(version.check(root=root), "2.0.0")
            self.assertIn('version.workspace=true', (root / "src/crates/core/Cargo.toml").read_text(encoding="utf-8"))
            self.assertIn('serde="1"', (root / "Cargo.toml").read_text())
