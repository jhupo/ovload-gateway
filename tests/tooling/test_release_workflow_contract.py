import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def workflow_section(text: str, name: str, following: str) -> str:
    start = text.index(f"\n  {name}:\n") + 1
    end = text.index(f"\n  {following}:\n", start)
    return text[start:end]


class ReleaseWorkflowContractTests(unittest.TestCase):
    def test_release_is_tag_only_and_signing_permissions_are_job_scoped(self):
        workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")
        self.assertRegex(workflow, r"(?m)^on:\n  push:\n    tags: \['v\*'\]$")
        self.assertRegex(workflow, r"(?m)^permissions:\n  contents: read$")

        container = workflow_section(workflow, "container", "publish")
        permissions = container.split("    permissions:\n", 1)[1].split("    steps:\n", 1)[0]
        self.assertIn("      contents: read", permissions)
        self.assertIn("      packages: write", permissions)
        self.assertIn("      id-token: write", permissions)
        self.assertIn("      attestations: write", permissions)
        self.assertNotIn("artifact-metadata:", permissions)

        self.assertIn("uses: docker/build-push-action@v6", container)
        self.assertRegex(container, r"(?m)^        id: push$")
        self.assertIn("uses: sigstore/cosign-installer@v4.1.2", container)

    def test_signature_and_slsa_attestation_bind_the_pushed_digest_and_exact_identity(self):
        workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")
        container = workflow_section(workflow, "container", "publish")
        expected_identity = (
            "https://github.com/jhupo/ovload-gateway/.github/workflows/"
            "release.yml@refs/tags/v${VERSION}"
        )
        expected_issuer = "https://token.actions.githubusercontent.com"

        self.assertIn('cosign sign --yes "${IMAGE_NAME}@${IMAGE_DIGEST}"', container)
        self.assertIn("subject-name: ${{ steps.image.outputs.name }}", container)
        self.assertIn("subject-digest: ${{ steps.push.outputs.digest }}", container)
        self.assertIn("push-to-registry: true", container)
        self.assertIn('identity="' + expected_identity + '"', container)
        self.assertIn('issuer="' + expected_issuer + '"', container)
        self.assertIn("--type slsaprovenance1", container)
        self.assertIn("create-storage-record: false", container)

        coordinator = (ROOT / "scripts/release.py").read_text(encoding="utf-8")
        self.assertIn(
            '"https://github.com/jhupo/ovload-gateway/.github/workflows/"', coordinator
        )
        self.assertIn('f"release.yml@refs/tags/v{version}"', coordinator)
        self.assertIn(expected_issuer, coordinator)
        self.assertIn('["cosign", "verify", *verification]', coordinator)
        self.assertIn('"verify-attestation"', coordinator)
        self.assertIn('"--type",\n                SLSA_PREDICATE', coordinator)
        self.assertRegex(coordinator, r'SLSA_PREDICATE = "slsaprovenance1"')

    def test_docker_ci_builds_and_checks_the_blue_green_roles(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        docker = workflow_section(workflow, "docker", "storage")
        self.assertIn("OVLOAD_BLUE_IMAGE: ovload-gateway:ci", docker)
        self.assertIn("OVLOAD_GREEN_IMAGE: ovload-gateway:ci", docker)
        self.assertIn("OVLOAD_WORKER_IMAGE: ovload-gateway:ci", docker)
        self.assertIn("-f deploy/compose.build.yml build api-blue", docker)
        self.assertIn("run --rm --no-deps api-blue migrate", docker)
        self.assertIn("api-blue api-green worker", docker)
        self.assertIn("exec -T api-blue curl", docker)
        self.assertIn("exec -T api-green curl", docker)
        self.assertIn("exec -T worker ovload-gateway worker-ready", docker)
        self.assertIn("--force-recreate --wait --wait-timeout 120 api-green", docker)
        self.assertNotIn("--force-recreate --wait gateway", docker)

    def test_docker_build_includes_the_workspace_and_its_embedded_migrations(self):
        dockerfile = (ROOT / "deploy/Dockerfile").read_text(encoding="utf-8")
        self.assertIn("COPY src/ src/", dockerfile)
        self.assertIn("COPY Cargo.toml Cargo.lock ./", dockerfile)
        self.assertIn("RUN cargo build --release --locked -p ovload-gateway", dockerfile)
        self.assertNotIn("COPY migrations/", dockerfile)


if __name__ == "__main__":
    unittest.main()
