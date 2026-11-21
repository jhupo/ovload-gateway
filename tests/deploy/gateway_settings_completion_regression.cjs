// Run only in the server browser image, against the dedicated clone on 19444.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const zh = require('/src/web/src/i18n/locales/zh.json')
const codex = require('/src/web/src/i18n/locales/zh-gateway-codex.json')
const profiles = require('/src/web/src/i18n/locales/zh-gateway-profiles.json')
const models = require('/src/web/src/i18n/locales/zh-gateway-models.json')
const base = 'https://192.168.2.150:19444'
const assets = '/src/test-results/gateway-settings-completion/web-dist'
const output = process.env.OVLOAD_GATEWAY_RESULTS || '/src/test-results/gateway-settings-completion/attempt-final'
const mode = process.env.OVLOAD_GATEWAY_LIVE === '1' ? 'live' : 'staged'
const priceOnly = process.env.OVLOAD_GATEWAY_PRICE_ONLY === '1'

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const failures = [], checks = [], external = {}, screenshots = []
  let session, lastWrite, current, writes = 0, forceStepUp = false, delayOpenaiPreview = false, delayedPreviews = 0
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/admin/settings/update' && request.method() === 'POST') {
      lastWrite = request.postDataJSON()
      writes += 1
    }
  })
  async function snapshot() {
    const response = await context.request.get('/api/admin/settings')
    assert.equal(response.status(), 200)
    const result = await response.json()
    assert.equal(result.code, 200)
    return result.data
  }
  const tab = (name) => page.locator('main [data-slot="tabs-list"]').first().getByRole('tab', { name, exact: true })
  const input = (name) => page.locator(`main input[name="${name}"]`)
  async function choose(locator, label) {
    await locator.click()
    await page.getByRole('option', { name: label, exact: true }).click()
  }
  async function toggle(name, checked) {
    const control = page.getByRole('switch', { name, exact: true })
    if ((await control.getAttribute('aria-checked')) !== String(checked)) await control.click()
    await expect(control).toHaveAttribute('aria-checked', String(checked))
  }
  async function save(name) {
    const button = page.locator('button[type="submit"][form="gateway-settings-form"]:visible')
    await expect(button).toBeEnabled()
    const [response] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/update' && response.request().method() === 'POST'),
      button.click(),
    ])
    assert.equal(response.status(), 200, name + ': HTTP save')
    const result = await response.json()
    assert.equal(result.code, 200, name + ': backend accepted save')
    await expect(page.getByRole('button', { name: zh.realGatewaySettings.reload, exact: true })).toBeEnabled()
    await expect(button).toBeDisabled()
    for (const key of ['smartSchedulingDefaults', 'updatedAt', 'updatedAtDisplay', 'openaiClientProfile', 'xaiClientProfile']) assert.equal(Object.hasOwn(lastWrite, key), false, name + ': GET-only field leaked')
    assert.equal(Object.hasOwn(lastWrite.providerRequestProfiles ?? {}, 'future_provider'), false, name + ': untouched future provider submitted')
    checks.push(name)
    console.log('PASS ' + name)
    return snapshot()
  }
  function unchangedProfiles(name) {
    assert.deepEqual(lastWrite.providerRequestProfiles ?? {}, {}, name + ': unrelated save must omit all profile updates')
  }
  async function reloadGateway() {
    await page.reload()
    await expect(input('refreshMarginSeconds')).toBeEnabled()
  }
  async function capture(name) {
    const file = `${output}/${mode}-${name}.png`
    await page.screenshot({ path: file, fullPage: true })
    screenshots.push(file)
  }
  try {
    await context.addCookies([{ name: 'vite-ui-theme', value: 'dark', url: base }])
    await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
    const login = await context.request.post('/api/v1/auth/sessions', {
      headers: { Origin: base },
      data: { login: 'ovload_gateway_ui_verify', password: fs.readFileSync('/test-runtime/administrator.password', 'utf8').trim() },
    })
    assert.equal(login.status(), 200, 'Isolated operator sign-in')
    session = await login.json()
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== base) return route.continue()
      if (url.pathname === '/api/admin/v1/auth/step-up/status' && forceStepUp) {
        forceStepUp = false
        return route.fulfill({ json: { allowed: false } })
      }
      if (url.pathname === '/api/admin/settings/client-profiles/openai/preview' && delayOpenaiPreview) {
        delayOpenaiPreview = false
        delayedPreviews += 1
        const response = await route.fetch()
        await new Promise((resolve) => setTimeout(resolve, 500))
        await route.fulfill({ response }).catch(() => {})
        return
      }
      if (!priceOnly && (url.pathname === '/api/admin/settings' && request.method() === 'GET' || url.pathname === '/api/admin/settings/update' && request.method() === 'POST')) {
        // Simulate a newer read model while keeping every write and preview real.
        const response = await route.fetch()
        const body = await response.json()
        assert.equal(body.code, 200)
        if (body.data.providerRequestProfiles) {
          body.data.providerRequestProfiles.future_provider = { futureMode: 'reserved', nested: { retained: true } }
          if (body.data.providerRequestProfiles.openai) body.data.providerRequestProfiles.openai.futureReadMetadata = { retained: true }
        }
        return route.fulfill({ response, json: body })
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) return route.continue()
      if (mode === 'live') {
        const target = 'https://192.168.2.150:19443' + (request.isNavigationRequest() ? '/' : url.pathname + url.search)
        return route.fulfill({ response: await context.request.get(target) })
      }
      const file = request.isNavigationRequest() ? assets + '/index.html' : path.resolve(assets, '.' + decodeURIComponent(url.pathname))
      if (!file.startsWith(assets + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.continue()
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
      return route.fulfill({ path: file, contentType: types[path.extname(file)] || 'application/octet-stream' })
    })
    await page.goto('/gateway-settings')
    await expect(input('refreshMarginSeconds')).toBeEnabled()
    await expect(page.locator('main [data-slot="tabs-list"]').first().getByRole('tab')).toHaveCount(6)
    if (process.env.OVLOAD_GATEWAY_SCREENSHOTS_ONLY === '1') {
      await tab(zh.gatewaySettings.codex).click()
      await page.locator('summary').filter({ hasText: codex.privacyPreview }).click()
      await page.getByRole('textbox', { name: codex.sampleBody, exact: true }).fill('{"metadata":{"private":true},"keep":"retained"}')
      await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/privacy/preview'),
        page.getByRole('button', { name: codex.runPreview, exact: true }).click(),
      ])
      await expect(page.getByTestId('privacy-preview-result')).toBeVisible()
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        await page.getByTestId('privacy-rule').first().scrollIntoViewIfNeeded()
        await capture(`codex-${width}-privacy-rule`)
        await page.getByTestId('privacy-preview-result').scrollIntoViewIfNeeded()
        await capture(`codex-${width}-privacy-preview`)
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await tab(zh.gatewaySettings.modelPricing).click()
      await expect(page.getByRole('button', { name: models.sync, exact: true })).toBeEnabled()
      const [response] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/pricing/sync/preview', { timeout: 60_000 }),
        page.getByRole('button', { name: models.sync, exact: true }).click(),
      ])
      const result = await response.json()
      const dialog = page.getByRole('dialog', { name: models.syncTitle, exact: true })
      if (response.ok() && result.code === 200) await expect(dialog.getByRole('table')).toBeVisible()
      else await expect(dialog.getByRole('alert')).toBeVisible()
      await page.setViewportSize({ width: 320, height: 844 })
      await capture('pricing-sync-320')
      fs.writeFileSync(`${output}/${mode}-mobile-screenshots.json`, JSON.stringify({ screenshots, pricePreviewStatus: response.status(), browserErrors: failures }, null, 2))
      assert.deepEqual(failures, [])
      console.log('PASS supplementary 390/320 privacy and 320 sync screenshots')
      return
    }
    if (!priceOnly) {
    const initial = await snapshot()
    const margin = initial.refreshMarginSeconds === 301 ? 302 : 301
    await input('refreshMarginSeconds').fill(String(margin))
    await input('maxWaitingPerKey').fill('7')
    current = await save('Basic settings save')
    unchangedProfiles('Basic settings')
    assert.equal(current.refreshMarginSeconds, margin)
    assert.equal(current.maxWaitingPerKey, 7)
    await reloadGateway()
    await expect(input('refreshMarginSeconds')).toHaveValue(String(margin))
    checks.push('Basic settings reload and forward-compatible profile reads')

    await tab(zh.realGatewaySettings.scheduling).click()
    const weight = Object.keys(current.smartScheduling)[0]
    const weightValue = current.smartScheduling[weight] === 1.7 ? 1.8 : 1.7
    await input(weight).fill(String(weightValue))
    await input('openaiGuardianReservedConcurrency').fill('1')
    await input('openaiSessionAffinityTtlHours').fill('12')
    await input('maxAccountRotations').fill('4')
    await choose(page.getByRole('combobox', { name: zh.realGatewaySettings.rotationStrategy, exact: true }), zh.realGatewaySettings.options.round_robin)
    await choose(page.getByRole('combobox', { name: zh.realGatewaySettings.openaiAccountAffinity, exact: true }), zh.realGatewaySettings.options.preferred)
    current = await save('Scheduling settings save')
    unchangedProfiles('Scheduling settings')
    assert.equal(current.smartScheduling[weight], weightValue)
    assert.equal(current.openaiGuardianReservedConcurrency, 1)
    assert.equal(current.openaiSessionAffinityTtlHours, 12)
    assert.equal(current.rotationStrategy, 'round_robin')
    assert.equal(current.openaiAccountAffinity, 'preferred')

    await tab(zh.gatewaySettings.codex).click()
    await input('minCodexDesktopVersion').fill('1.2.3')
    await input('minCodexCliVersion').fill('1.2.3')
    await toggle(codex.accountAutoFreezeEnabled, true)
    await toggle(codex.accountAutoFreezeProbeEnabled, true)
    await toggle(codex.accountAutoFreezeAdaptiveConcurrency, true)
    await input('accountAutoFreezeThreshold').fill('13')
    await input('accountAutoFreezeWindowSeconds').fill('660')
    await input('accountAutoFreezeDurationSeconds').fill('7800')
    await input('accountAutoFreezeProbeModel').fill('gpt-5.5')
    await toggle(codex.accountWarmupEnabled, true)
    while (await page.getByRole('button', { name: codex.deleteTime, exact: true }).count() > 1) await page.getByRole('button', { name: codex.deleteTime, exact: true }).last().click()
    await input('accountWarmupScheduleTime.0').fill('03:17')
    await page.getByRole('button', { name: codex.addTime, exact: true }).click()
    await input('accountWarmupScheduleTime.1').fill('18:44')
    await input('accountWarmupModel').fill('gpt-5.5')
    await input('resetCreditLeadMinutes').fill('15')
    await toggle(codex.weeklyRemainingCondition, true)
    await input('resetCreditMaxWeeklyRemainingPercent').fill('51')
    await toggle(codex.requestLocationEnabled, true)
    for (const [key, value] of Object.entries({ country: 'US', region: 'California', city: 'Los Angeles', timezone: 'America/Los_Angeles' })) await input('requestLocation.' + key).fill(value)
    await toggle(codex.privacyEnabled, true)
    while (await page.getByTestId('privacy-rule').count()) await page.getByTestId('privacy-rule').first().getByRole('button', { name: codex.deleteRule, exact: true }).click()
    await page.getByRole('button', { name: codex.addRule, exact: true }).click()
    await page.getByTestId('privacy-rule').getByRole('textbox', { name: codex.ruleName, exact: true }).fill('Gateway verification privacy rule')
    await page.locator('summary').filter({ hasText: codex.privacyPreview }).click()
    await page.getByRole('textbox', { name: codex.sampleBody, exact: true }).fill('{"metadata":{"private":true},"keep":"retained"}')
    const [privacyResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/privacy/preview'),
      page.getByRole('button', { name: codex.runPreview, exact: true }).click(),
    ])
    assert.equal(privacyResponse.status(), 200)
    const privacy = (await privacyResponse.json()).data
    assert.equal(Object.hasOwn(privacy.body, 'metadata'), false)
    assert.equal(privacy.body.keep, 'retained')
    await expect(page.getByTestId('privacy-preview-result')).toBeVisible()
    current = await save('Codex protection, automation, privacy and location save')
    unchangedProfiles('Codex settings')
    assert.equal(current.accountAutoFreezeThreshold, 13)
    assert.equal(current.accountAutoFreezeProbeEnabled, true)
    assert.equal(current.accountAutoFreezeAdaptiveConcurrency, true)
    assert.equal(current.accountWarmupEnabled, true)
    assert.equal(current.accountWarmupScheduleTime, '03:17,18:44')
    assert.equal(current.resetCreditLeadMinutes, 15)
    assert.equal(current.resetCreditMaxWeeklyRemainingPercent, 51)
    assert.equal(current.codexPrivacyPolicy.rules[0].name, 'Gateway verification privacy rule')
    assert.equal(current.requestLocation.city, 'Los Angeles')
    await reloadGateway()
    await tab(zh.gatewaySettings.codex).click()
    await expect(input('accountWarmupScheduleTime.1')).toHaveValue('18:44')
    await expect(input('requestLocation.country')).toHaveValue('US')
    await toggle(codex.weeklyRemainingCondition, false)
    current = await save('Nullable quota reset condition save')
    assert.equal(current.resetCreditMaxWeeklyRemainingPercent, null)

    const openai = page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: profiles.openaiTitle, exact: true }) })
    await choose(openai.getByRole('combobox', { name: profiles.mode, exact: true }), profiles.preset)
    await choose(openai.getByRole('combobox', { name: profiles.mode, exact: true }), profiles.custom)
    await input('profile-openai-userAgent').fill('codex_exec/1.2.3')
    delayOpenaiPreview = true
    await Promise.all([
      page.waitForRequest((request) => new URL(request.url()).pathname === '/api/admin/settings/client-profiles/openai/preview'),
      openai.getByRole('button', { name: profiles.preview, exact: true }).click(),
    ])
    await input('profile-openai-userAgent').fill('codex_exec/1.2.4')
    await input('profile-openai-userAgent').fill('codex_exec/1.2.3')
    await expect(openai.getByRole('button', { name: profiles.preview, exact: true })).toBeEnabled()
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/client-profiles/openai/preview' && response.request().postDataJSON().configuration.userAgent === 'codex_exec/1.2.3'),
      openai.getByRole('button', { name: profiles.preview, exact: true }).click(),
    ])
    await expect(page.getByTestId('profile-openai-preview')).toContainText('codex_exec/1.2.3')
    await expect(openai.getByRole('button', { name: profiles.preview, exact: true })).toBeEnabled()
    assert.equal(delayedPreviews, 1)
    checks.push('A-B-A profile edits cancel a delayed real preview and permit retry')
    current = await save('OpenAI identity preview and save')
    assert.deepEqual(Object.keys(lastWrite.providerRequestProfiles), ['openai'])
    assert.equal(current.providerRequestProfiles.openai.userAgent, 'codex_exec/1.2.3')
    const savedOpenai = current.providerRequestProfiles.openai
    await reloadGateway()
    await tab(zh.gatewaySettings.codex).click()
    await expect(input('profile-openai-userAgent')).toHaveValue('codex_exec/1.2.3')

    await tab(zh.realGatewaySettings.xai).click()
    const xai = page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: profiles.xaiTitle, exact: true }) })
    await choose(xai.getByRole('combobox', { name: profiles.versionMode, exact: true }), profiles.fixed)
    await input('profile-xai-clientVersion').fill('not-a-version')
    const beforeInvalidSave = writes
    await page.locator('button[type="submit"][form="gateway-settings-form"]:visible').click()
    await expect(input('profile-xai-clientVersion')).toHaveAttribute('aria-invalid', 'true')
    assert.equal(writes, beforeInvalidSave, 'Invalid profile must not submit stale values')
    await input('profile-xai-clientVersion').fill('1.0.13')
    await input('profile-xai-clientIdentifier').fill('gateway-ui-verification')
    await xai.getByRole('button', { name: profiles.preview, exact: true }).click()
    await expect(page.getByTestId('profile-xai-preview')).toContainText('grok-shell/1.0.13')
    current = await save('xAI identity preview, validation and save')
    assert.deepEqual(Object.keys(lastWrite.providerRequestProfiles), ['xai'])
    assert.deepEqual(current.providerRequestProfiles.openai, savedOpenai)
    assert.equal(current.providerRequestProfiles.xai.clientIdentifier, 'gateway-ui-verification')
    await reloadGateway()
    await tab(zh.realGatewaySettings.xai).click()
    await expect(input('profile-xai-clientVersion')).toHaveValue('1.0.13')
    await xai.getByRole('button', { name: profiles.restoreDefaults, exact: true }).click()
    await tab(zh.gatewaySettings.codex).click()
    await openai.getByRole('button', { name: profiles.restoreDefaults, exact: true }).click()
    current = await save('Restore provider defaults')
    assert.deepEqual(Object.keys(lastWrite.providerRequestProfiles).sort(), ['openai', 'xai'])
    assert.equal(current.providerRequestProfiles.openai.versionMode, 'latest')
    assert.equal(current.providerRequestProfiles.xai.versionMode, 'latest')

    await tab(zh.realGatewaySettings.models).click()
    await page.getByRole('button', { name: models.addMapping, exact: true }).click()
    const dialog = page.getByRole('dialog')
    const publicModel = 'gateway-ui-alias-' + Date.now()
    await dialog.getByRole('textbox', { name: models.publicModel, exact: true }).fill(publicModel)
    await dialog.getByRole('textbox', { name: models.upstreamModel, exact: true }).fill('gpt-5.5')
    await dialog.getByRole('button', { name: models.apply, exact: true }).click()
    current = await save('Global model mapping save')
    unchangedProfiles('Model mapping')
    assert.equal(current.modelMappings[publicModel], 'gpt-5.5')
    await reloadGateway()
    await tab(zh.realGatewaySettings.models).click()
    await expect(page.getByText(publicModel, { exact: true })).toBeVisible()

    await tab(zh.realGatewaySettings.xai).click()
    await choose(xai.getByRole('combobox', { name: profiles.versionMode, exact: true }), profiles.fixed)
    await input('profile-xai-clientVersion').fill('invalid-hidden-draft')
    await tab(zh.gatewaySettings.basic).click()
    const beforeHiddenInvalidSave = writes
    await page.locator('button[type="submit"][form="gateway-settings-form"]:visible').click()
    assert.equal(writes, beforeHiddenInvalidSave, 'Invalid profile on another tab must prevent submitting stale values')
    await tab(zh.gatewaySettings.basic).click()
    await input('refreshMarginSeconds').fill('333')
    await tab(zh.realGatewaySettings.scheduling).click()
    await input('maxAccountRotations').fill('5')
    await tab(zh.gatewaySettings.codex).click()
    await input('accountAutoFreezeThreshold').fill('14')
    await tab(zh.realGatewaySettings.xai).click()
    await input('profile-xai-clientVersion').fill('1.0.14')
    current = await save('Multiple tab drafts saved atomically')
    assert.equal(current.refreshMarginSeconds, 333)
    assert.equal(current.maxAccountRotations, 5)
    assert.equal(current.accountAutoFreezeThreshold, 14)
    assert.equal(current.providerRequestProfiles.xai.clientVersion, '1.0.14')
    assert.deepEqual(Object.keys(lastWrite.providerRequestProfiles), ['xai'])
    await reloadGateway()
    await expect(input('refreshMarginSeconds')).toHaveValue('333')
    await tab(zh.realGatewaySettings.scheduling).click()
    await expect(input('maxAccountRotations')).toHaveValue('5')
    await tab(zh.gatewaySettings.codex).click()
    await expect(input('accountAutoFreezeThreshold')).toHaveValue('14')
    await tab(zh.realGatewaySettings.xai).click()
    await expect(input('profile-xai-clientVersion')).toHaveValue('1.0.14')
    checks.push('Hidden tab validation and multi-tab draft reload')

    await tab(zh.gatewaySettings.basic).click()
    await input('refreshMarginSeconds').fill('334')
    const beforeStepUp = writes
    forceStepUp = true
    const saveButton = page.locator('button[type="submit"][form="gateway-settings-form"]:visible')
    await saveButton.click()
    const verification = page.getByRole('dialog', { name: '验证身份', exact: true })
    await expect(verification).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(verification).toBeHidden()
    await expect(saveButton).toBeEnabled()
    await expect(input('refreshMarginSeconds')).toHaveValue('334')
    assert.equal(writes, beforeStepUp, 'Cancelling step-up must not submit settings')
    current = await save('Cancelled step-up preserves draft and permits retry')
    assert.equal(current.refreshMarginSeconds, 334)

    await tab(zh.gatewaySettings.codex).click()
    const privacyStep = page.getByTestId('privacy-step').first()
    await choose(privacyStep.getByRole('combobox', { name: codex.action, exact: true }), codex.actions.set_value)
    await choose(privacyStep.getByRole('combobox', { name: codex.valueType, exact: true }), codex.valueTypes.object)
    await save('Privacy structured value baseline')
    const jsonValue = privacyStep.getByRole('textbox', { name: codex.fixedValue, exact: true })
    await jsonValue.fill('{')
    await expect(jsonValue).toHaveAttribute('data-local-invalid', 'true')
    await page.locator('a[href="/general-settings"]:visible').click()
    const discard = page.getByRole('alertdialog', { name: zh.gatewaySettings.discardTitle, exact: true })
    await expect(discard).toBeVisible()
    await discard.getByRole('button', { name: zh.confirm_dialog.cancel, exact: true }).click()
    await expect(discard).toBeHidden()
    assert.equal(new URL(page.url()).pathname, '/gateway-settings')
    await expect(jsonValue).toHaveValue('{')
    await jsonValue.fill('{}')
    await expect(saveButton).toBeDisabled()
    checks.push('Invalid local JSON protects sidebar navigation and retains input')

    const [locationResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/location/detect', { timeout: 60_000 }),
      page.getByRole('button', { name: codex.detectLocation, exact: true }).click(),
    ])
    const locationResult = await locationResponse.json()
    if (locationResponse.ok() && locationResult.code === 200) {
      const location = locationResult.data
      assert.ok(['detected', 'failed', 'conflict', 'notRequested'].includes(location.status), 'Location probe must return a recognized status')
      if (location.status === 'detected') {
        assert.ok(location.location.country)
        await expect(page.getByRole('button', { name: codex.applyLocation, exact: true })).toBeVisible()
      }
      external.location = location
      checks.push('Location detection returns a recognized real backend status')
    } else {
      external.location = { status: 'httpError', http: locationResponse.status(), response: locationResult }
    }
    await capture('codex-privacy-location')

    for (const [key, name] of [['basic', zh.gatewaySettings.basic], ['scheduling', zh.realGatewaySettings.scheduling], ['codex', zh.gatewaySettings.codex], ['xai', zh.realGatewaySettings.xai], ['models', zh.realGatewaySettings.models], ['pricing', zh.gatewaySettings.modelPricing]]) {
      await tab(name).click()
      if (key === 'pricing') await expect(page.getByRole('button', { name: models.sync, exact: true })).toBeEnabled()
      assert.doesNotMatch(await page.locator('main').innerText(), /gateway(?:Codex|Profiles|Models)[.:]/, 'All gateway settings labels must resolve translations')
      await capture('tab-' + key)
    }
    }
    const priceBaseline = await snapshot()
    const marginDirection = priceBaseline.refreshMarginSeconds > Number.MAX_SAFE_INTEGER - 2 ? -1 : 1
    const priceDraftMargin = priceBaseline.refreshMarginSeconds + marginDirection
    const priceSavedMargin = priceBaseline.refreshMarginSeconds + marginDirection * 2
    await tab(zh.gatewaySettings.basic).click()
    await input('refreshMarginSeconds').fill(String(priceDraftMargin))
    await tab(zh.gatewaySettings.modelPricing).click()
    await expect(page.getByRole('button', { name: models.sync, exact: true })).toBeEnabled()
    const [pricePreviewResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/pricing/sync/preview', { timeout: 60_000 }),
      page.getByRole('button', { name: models.sync, exact: true }).click(),
    ])
    const syncDialog = page.getByRole('dialog', { name: models.syncTitle, exact: true })
    const pricePreviewResult = await pricePreviewResponse.json()
    if (pricePreviewResponse.ok() && pricePreviewResult.code === 200) {
      const preview = pricePreviewResult.data
      await expect(syncDialog.getByRole('checkbox', { name: models.selectPage, exact: true })).toBeVisible()
      await choose(syncDialog.getByRole('combobox', { name: zh.data_table.rows_per_page, exact: true }), '50')
      for (let pageNumber = 0; pageNumber < 300; pageNumber += 1) {
        const pageCheckbox = syncDialog.getByRole('checkbox', { name: models.selectPage, exact: true })
        const state = await pageCheckbox.getAttribute('aria-checked')
        if (state === 'mixed') await pageCheckbox.click()
        if (state !== 'false') await pageCheckbox.click()
        const nextPage = syncDialog.getByRole('button', { name: zh.data_table.next_page, exact: true })
        if (!(await nextPage.isEnabled())) break
        await nextPage.click()
        assert.ok(pageNumber < 299, 'Sync preview pagination exceeds the backend model limit')
      }
      const firstPage = syncDialog.getByRole('button', { name: zh.data_table.first_page, exact: true })
      if (await firstPage.isEnabled()) await firstPage.click()
      await syncDialog.locator('tbody tr').first().getByRole('checkbox').click()
      await capture('price-sync-preview')
      const [syncResponse] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/settings/pricing/sync', { timeout: 60_000 }),
        syncDialog.getByRole('button', { name: models.syncSelected, exact: true }).click(),
      ])
      const synced = await syncResponse.json()
      assert.equal(syncResponse.status(), 200)
      assert.equal(synced.code, 200)
      assert.equal(synced.data.saved, true)
      const selected = syncResponse.request().postDataJSON().models
      assert.equal(Object.values(selected).flat().length, 1, 'Only one model is selected for real synchronization')
      const catalogResponse = await context.request.get('/api/admin/settings/pricing')
      const catalog = (await catalogResponse.json()).data
      for (const [provider, selectedModels] of Object.entries(selected)) for (const model of selectedModels) assert.deepEqual(catalog.synced[provider][model], preview.prices[provider][model])
      external.priceSync = { status: 'saved', selected }
      checks.push('Real external price preview and one selected model synchronized')
      await expect(syncDialog).toBeHidden()
      await tab(zh.gatewaySettings.basic).click()
      await expect(input('refreshMarginSeconds')).toHaveValue(String(priceDraftMargin))
      await input('refreshMarginSeconds').fill(String(priceSavedMargin))
      current = await save('Price synchronization refreshes revision and preserves unsaved gateway draft')
      assert.equal(current.refreshMarginSeconds, priceSavedMargin)
    } else {
      external.priceSync = { status: 'failed', http: pricePreviewResponse.status(), response: pricePreviewResult }
      await expect(syncDialog.getByRole('alert')).toBeVisible()
      await capture('price-sync-error')
      await syncDialog.getByRole('button', { name: models.cancel, exact: true }).click()
      if (priceOnly) throw new Error('Real external price preview failed: ' + JSON.stringify(external.priceSync))
    }
    assert.deepEqual(failures, [])
    const report = { mode, priceOnly, checks, browserErrors: failures, settingsWrites: writes, actualBackendPreviews: priceOnly ? [] : ['privacy', 'openai', 'xai'], unknownProfileReadMetadataAccepted: !priceOnly, untouchedProfilesOmittedFromWrites: true, external, screenshots }
    fs.writeFileSync(`${output}/${mode}-${priceOnly ? 'price' : 'functional'}-result.json`, JSON.stringify(report, null, 2))
    console.log(`PASS ${checks.length} gateway settings workflows with real saves, reloads and previews`)
  } catch (error) {
    fs.writeFileSync(`${output}/${mode}-functional-failure.json`, JSON.stringify({ mode, checks, settingsWrites: writes, browserErrors: failures, external, screenshots, error: String(error) }, null, 2))
    await page.screenshot({ path: `${output}/${mode}-functional-failure.png`, fullPage: true }).catch(() => {})
    throw error
  } finally {
    if (session) await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: base, 'X-CSRF-Token': session.csrf_token } })
    await browser.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
