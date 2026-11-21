// Real service and Google OAuth rejection checks. Never uses a user's authorization code.
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { request } = require('node:module').createRequire('/src/web/package.json')('@playwright/test')

const baseURL = process.env.GEMINI_OAUTH_BASE_URL || 'https://192.168.2.150:19443'
const output = '/src/test-results/gemini-oauth'

;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, timeout: 95000 })
  let csrf
  const report = { passed: false, checks: [], accountDataChanged: false }
  try {
    const loginInput = {
      headers: { Origin: baseURL },
      data: {
        login: 'ovload_test_admin',
        password: fs.readFileSync('/verify/administrator.password', 'utf8').trim(),
      },
    }
    let login = await api.post('/api/v1/auth/sessions', loginInput)
    if (login.status() === 429) {
      const seconds = Number(login.headers()['retry-after'] || 60)
      assert.ok(seconds > 0 && seconds <= 60, 'Login rate limit exceeds bounded test retry')
      console.log('Waiting for login rate limit: ' + seconds + ' seconds')
      await new Promise(resolve => setTimeout(resolve, seconds * 1000))
      login = await api.post('/api/v1/auth/sessions', loginInput)
    }
    assert.equal(login.status(), 200)
    const session = await login.json()
    csrf = (session.data || session).csrf_token
    report.sessionId = (session.data || session).session_id
    assert.ok(csrf)
    const headers = { Origin: baseURL, 'X-CSRF-Token': csrf }
    const list = () => api.get('/api/admin/accounts?page=1&pageSize=100').then(r => r.json())
    const before = (await list()).data.items.map(a => a.id).sort()
    for (const [route, proxy, expected] of [
      ['direct', '', '出站代理'],
      ['proxy', 'socks5h://192.168.2.85:12334', '授权码'],
    ]) {
      const start = await api.post('/api/admin/accounts/oauth/start', {
        headers,
        data: { provider: 'gemini', name: 'Gemini OAuth diagnostic', outboundProxyUrl: proxy },
      })
      assert.ok([200, 201].includes(start.status()), 'OAuth start: ' + start.status())
      const flow = (await start.json()).data
      const url = new URL(flow.authorizationUrl)
      assert.equal(url.origin, 'https://accounts.google.com')
      assert.equal(url.searchParams.get('redirect_uri'), 'https://codeassist.google.com/authcode')
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
      assert.ok(url.searchParams.get('code_challenge'))
      const at = Date.now()
      const complete = await api.post('/api/admin/accounts/oauth/complete', {
        headers,
        data: {
          provider: 'gemini',
          flowId: flow.flowId,
          callbackUrl: 'ovload-deliberately-invalid-diagnostic-code',
        },
      })
      const result = await complete.json()
      assert.equal(complete.status(), 502)
      assert.ok(result.message.includes(expected), route + ': ' + result.message)
      assert.ok(!JSON.stringify(result).includes('ovload-deliberately-invalid'))
      report.checks.push({ route, status: complete.status(), message: result.message, durationMs: Date.now() - at })
    }
    assert.deepEqual((await list()).data.items.map(a => a.id).sort(), before)
    report.passed = true
  } finally {
    if (csrf) {
      const logout = await api.delete('/api/admin/v1/auth/session', {
        headers: { Origin: baseURL, 'X-CSRF-Token': csrf },
      })
      report.logoutStatus = logout.status()
      assert.equal(logout.status(), 204)
    }
    fs.writeFileSync(output + '/live.json', JSON.stringify(report, null, 2))
    await api.dispose()
  }
  console.log(JSON.stringify(report, null, 2))
})().catch(error => { console.error(error.stack); process.exitCode = 1 })
