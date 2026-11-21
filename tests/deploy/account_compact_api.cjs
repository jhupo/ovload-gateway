// Server-only checks against the user's new OAuth account; never print credentials.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { request } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL = 'https://192.168.2.150:19443', out = '/src/test-results/account-compact';
const accountId = 'acct_01a1daf7af217688b3e6a31c4a0ea9e2';
(async () => {
  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true, timeout: 60000 });
  const login = await ctx.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } });
  assert.equal(login.status(), 200);
  const session = await login.json(), headers = { Origin: baseURL, 'X-CSRF-Token': session.csrf_token }, checks = [];
  async function call(name, path, data) {
    const started = Date.now();
    const response = data === undefined ? await ctx.get('/api/admin' + path) : await ctx.post('/api/admin' + path, { headers, data });
    const body = await response.json();
    const item = { name, status: response.status(), ms: Date.now() - started, passed: response.ok() && body.code === 200 };
    checks.push(item); fs.writeFileSync(out + '/api.json', JSON.stringify({ checks }, null, 2));
    assert.ok(item.passed, name + ': HTTP ' + item.status);
    return body.data;
  }
  try {
    const original = (await call('Account detail', '/accounts/detail?accountId=' + accountId)).account;
    assert.equal(original.authenticationKind, 'oauth');
    await Promise.all([
      call('Personal info', '/accounts/personal-info?accountId=' + accountId),
      call('Quota forecast', '/accounts/quota-forecast?accountId=' + accountId),
      call('Reset credit availability (not consumed)', '/accounts/reset-credits?accountId=' + accountId),
    ]);
    await call('Refresh quota', '/accounts/quota/refresh', { accountId });
    const synced = await call('Sync upstream models', '/accounts/models/refresh', { accountId });
    assert.ok(synced.models.length > 0);
    await call('Cached models', '/accounts/models?accountId=' + accountId);
    const catalog = await call('Connection test models', '/accounts/connection-test/models', { accountId });
    const textModels = catalog.models.filter(m => m.kind === 'text');
    const model = textModels.find(m => /mini|luna/.test(m.id)) ?? textModels.find(m => !/review|image/.test(m.id));
    assert.ok(model);
    const test = await ctx.post('/api/admin/accounts/connection-test', { headers, data: { accountId, modelId: model.id }, timeout: 180000 });
    const frames = (await test.text()).split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)));
    const completed = frames.some(e => e.type === 'test_complete' && e.success);
    checks.push({ name: 'Real text connection test', status: test.status(), model: model.id, events: frames.filter(e => e.type !== 'content').map(e => e.type), passed: completed });
    assert.ok(completed, 'Connection test did not complete successfully');
    const starts = [];
    for (const reauthorize of [false, false, true, true]) {
      const flow = await call('OAuth identity ' + (reauthorize ? 'reauthorize' : 'new'), '/accounts/oauth/start', { provider: 'openai', name: 'Device identity verification', outboundProxyId: original.outboundProxyId ?? '', ...(reauthorize ? { accountId } : {}) });
      const outer = new URL(flow.authorizationUrl), inner = new URL(outer.searchParams.get('authorize_url'));
      const q = inner.searchParams;
      assert.equal(q.get('source_surface_stable_id'), q.get('codex_origin_stable_id'));
      assert.equal(q.get('code_challenge_method'), 'S256');
      starts.push({ device: q.get('source_surface_stable_id'), state: q.get('state'), pkce: q.get('code_challenge') });
    }
    assert.notEqual(starts[0].device, starts[1].device);
    assert.equal(starts[2].device, starts[3].device);
    assert.equal(new Set(starts.map(s => s.state)).size, 4);
    assert.equal(new Set(starts.map(s => s.pkce)).size, 4);
    checks.push({ name: 'New account device IDs differ; existing account reauthorization reuses device; all flows use fresh state/PKCE', passed: true });
    const final = (await call('Final account detail', '/accounts/detail?accountId=' + accountId)).account;
    assert.equal(final.enabled, original.enabled);
    assert.equal(final.outboundProxyId, original.outboundProxyId);
    fs.writeFileSync(out + '/api.json', JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    if (!fs.readFileSync(out + '/api.json', 'utf8').includes('"passed": true,\n  "checks"')) fs.writeFileSync(out + '/api.json', JSON.stringify({ checks }, null, 2));
    await ctx.delete('/api/admin/v1/auth/session', { headers }); await ctx.dispose();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
