"""Run lease integration tests using the isolated Redis; never production Redis."""
import json,subprocess
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,quote
src=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
runtime=Path('/opt/webcodex/ovload-gateway-ui-verify-20261102')
config=json.loads((runtime/'deploy/config.yaml').read_text())
u=urlsplit(config['store']['redis']['url'])
assert u.hostname=='ovload-gateway-ui-redis'
envfile=runtime/'lease-tests.env'
envfile.write_text('CPR_TEST_REDIS_URL='+urlunsplit(u._replace(netloc=':'+quote(config['store']['redis']['password'],safe='')+'@'+u.netloc))+'\n')
envfile.chmod(0o600)
subprocess.run(['docker','run','-d','--name','ovload-management-lease-tests','--network','ovload-codex-test','--env-file',str(envfile),'-v',str(src)+':/src','-v','/opt/webcodex/.cargo-registry:/usr/local/cargo/registry','-v','/opt/webcodex/cargo-cache-codex-test/cargo/git:/usr/local/cargo/git','-w','/src','-e','RUSTUP_TOOLCHAIN=1.99.1','-e','CARGO_PROFILE_DEV_DEBUG=0','-e','CARGO_PROFILE_TEST_DEBUG=0','-e','CARGO_INCREMENTAL=0','-e','CARGO_BUILD_JOBS=2','rust:1.99.1-bookworm','bash','-c','cargo test --offline -p ovload-store --test main redis::credential_leases::details > test-results/management-completion/lease-tests.log 2>&1'],check=True)
envfile.unlink()
