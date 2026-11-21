import { expect, test, type Page } from '../../web/node_modules/@playwright/test'

const save = (page: Page) =>
  page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })

const numericFields = [
  { id: 'access-token-minutes', key: 'accessTokenMinutes', min: 5, max: 1440, initial: '30', tab: 'Basic settings' },
  { id: 'refresh-token-days', key: 'refreshTokenDays', min: 1, max: 365, initial: '30', tab: 'Basic settings' },
  { id: 'auth-rate-limit', key: 'authRateLimitPerMinute', min: 1, max: 10000, initial: '60', tab: 'Login protection' },
  { id: 'invalid-auth-threshold', key: 'invalidAuthThreshold', min: 1, max: 1000, initial: '5', tab: 'Login protection' },
  { id: 'invalid-auth-block-minutes', key: 'invalidAuthBlockMinutes', min: 1, max: 1440, initial: '15', tab: 'Login protection' },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.goto('/security-authentication')
})

for (const spec of numericFields) {
  test(`${spec.key} rejects invalid values across tabs and saves integer boundaries`, async ({ page }) => {
    const tab = page.getByRole('tab', { name: spec.tab, exact: true })
    const field = page.locator('#' + spec.id)
    for (const invalid of ['', String(spec.min - 1), '1.5', String(spec.max + 1)]) {
      await tab.click()
      await field.fill(invalid)
      await page.getByRole('tab', { name: 'Quick login', exact: true }).click()
      await save(page).click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(field).toBeFocused()
      await expect(field).toHaveValue(invalid)
      await expect(field).toHaveAttribute('aria-invalid', 'true')
      await expect(page.locator('#' + spec.id + '-error')).toContainText(`between ${spec.min} and ${spec.max}`)
      expect(await page.evaluate(() => sessionStorage.getItem('ovload.security-authentication.draft'))).toBeNull()
    }
    for (const boundary of [spec.min, spec.max]) {
      await field.fill(String(boundary))
      await save(page).click()
      await expect(save(page)).toBeDisabled()
      expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem('ovload.security-authentication.draft')!)[key], spec.key)).toBe(boundary)
      await page.reload()
      await tab.click()
      await expect(field).toHaveValue(String(boundary))
    }
    await page.evaluate(({ key, max }) => {
      const draft = JSON.parse(sessionStorage.getItem('ovload.security-authentication.draft')!)
      draft[key] = max + 1
      sessionStorage.setItem('ovload.security-authentication.draft', JSON.stringify(draft))
    }, spec)
    await page.reload()
    await tab.click()
    await expect(field).toHaveValue(spec.initial)
  })
}

test('secret-only edits are protected, cleared on save/discard and retained on storage failure', async ({ page }) => {
  await page.getByRole('tab', { name: 'Login protection', exact: true }).click()
  await page.getByRole('switch', { name: 'Enable human verification', exact: true }).check()
  await page.getByLabel('Site key', { exact: true }).fill('sample-site-key')
  await save(page).click()
  const secret = page.getByLabel('Secret key', { exact: true })
  const value = await page.evaluate(() => crypto.randomUUID())
  await secret.fill(value)
  await expect(save(page)).toBeEnabled()
  await page.getByRole('link', { name: 'Website settings', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(secret).toHaveValue(value)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ovload.security-authentication.draft') throw new DOMException('Sample storage failure', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await save(page).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Unable to save settings' })).toBeVisible()
  await expect(secret).toHaveValue(value)
  await expect(save(page)).toBeEnabled()
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(value)
  await page.getByRole('button', { name: 'Reset', exact: true }).filter({ visible: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(secret).toHaveValue('')
  await expect(save(page)).toBeDisabled()
  await page.reload()
  await page.getByRole('tab', { name: 'Login protection', exact: true }).click()
  await secret.fill(value)
  await save(page).click()
  await expect(secret).toHaveValue('')
  await expect(save(page)).toBeDisabled()
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(value)
})

test('keeps security authentication focused on basic, protection and quick login', async ({ page }) => {
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(page.getByRole('tab', { name: 'Quick login', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Basic settings', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Login protection', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Identity policy', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Multi-factor authentication', exact: true })).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Sensitive-operation verification', exact: true })).toBeChecked()
  await expect(page.getByLabel('Access token lifetime', { exact: true })).toHaveValue('30')
  await expect(page.getByLabel('Refresh token lifetime', { exact: true })).toHaveValue('30')

  await page.getByRole('tab', { name: 'Login protection', exact: true }).click()
  await page.getByRole('switch', { name: 'Enable human verification', exact: true }).check()
  await expect(page.getByText('CAPTCHA provider', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Cloudflare Turnstile', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)
  await page.getByLabel('Site key', { exact: true }).fill('preview-site-key')
  await page.getByLabel('Secret key', { exact: true }).fill('preview-secret-key')
  await page.getByLabel('Invalid authentication threshold', { exact: true }).fill('8')
  await page.getByRole('switch', { name: 'Enable access blocks', exact: true }).check()

  await save(page).click()
  await expect(save(page)).toBeDisabled()

  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ovload.security-authentication.draft')!))
  expect(stored.captchaEnabled).toBe(true)
  expect(stored.captchaProvider).toBe('turnstile')
  expect(stored.captchaSiteKey).toBe('preview-site-key')
  expect(stored).not.toHaveProperty('captchaSecretKey')
  expect(JSON.stringify(stored)).not.toContain('preview-secret-key')
  expect(stored.invalidAuthThreshold).toBe(8)
  expect(stored.accessBlockEnabled).toBe(true)
  expect(stored).not.toHaveProperty('pendingIdentityHours')
  expect(stored).not.toHaveProperty('identityBindingEnabled')
  expect(stored).not.toHaveProperty('requireVerifiedEmail')

  await page.reload()
  await page.getByRole('tab', { name: 'Login protection', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Enable human verification', exact: true })).toBeChecked()
  await expect(page.getByText('Cloudflare Turnstile', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Tencent CAPTCHA', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Site key', { exact: true })).toHaveValue('preview-site-key')
  await expect(page.getByLabel('Secret key', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Invalid authentication threshold', { exact: true })).toHaveValue('8')
  await expect(page.getByRole('switch', { name: 'Enable access blocks', exact: true })).toBeChecked()
})

test('regenerates an administrator key through confirmation and a copyable dialog', async ({ page }) => {
  const regenerate = page.getByRole('button', { name: 'Regenerate', exact: true })
  const initialKey = await page.locator('code').first().textContent()
  await regenerate.click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Regenerate', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const generatedKey = await dialog.locator('code').textContent()
  expect(generatedKey).toMatch(/^ovload-[0-9a-f-]{36}$/i)
  expect(generatedKey).not.toBe(initialKey)
  await expect(dialog.getByRole('button', { name: 'Copy administrator key', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(regenerate).toBeFocused()
})

test('quick login configuration validates across tabs, persists, resets and blocks dirty navigation', async ({ page }) => {
  const quick = page.getByRole('tab', { name: 'Quick login', exact: true })
  await quick.click()
  const lifetime = page.getByLabel('Pending identity lifetime', { exact: true })
  for (const invalid of ['', '0', '169', '1.5']) {
    await lifetime.fill(invalid)
    await page.getByRole('tab', { name: 'Basic settings', exact: true }).click()
    await save(page).click()
    await expect(quick).toHaveAttribute('aria-selected', 'true')
    await expect(lifetime).toBeFocused()
    await expect(lifetime).toHaveAttribute('aria-invalid', 'true')
  }
  await lifetime.fill('48')
  await page.locator('#github-callback').fill('https://example.com/callback')
  await save(page).click()
  await expect(page.locator('#github-client-id')).toBeFocused()
  await page.locator('#github-client-id').fill('preview-client')
  await page.locator('#github-callback').fill('https://user:pass@example.com/callback')
  await save(page).click()
  await expect(page.locator('#github-callback')).toBeFocused()
  await page.locator('#github-callback').fill('https://example.com/callback')
  for (const provider of ['github', 'google', 'linuxdo']) {
    await expect(page.locator('#' + provider + '-secret')).toBeDisabled()
  }
  await expect(page.getByRole('switch', { name: 'GitHub Quick login', exact: true })).toHaveCount(0)
  await save(page).click()
  await expect(save(page)).toBeDisabled()
  await page.reload()
  await quick.click()
  await expect(lifetime).toHaveValue('48')
  await expect(page.locator('#github-client-id')).toHaveValue('preview-client')
  await lifetime.fill('72')
  await page.getByRole('button', { name: 'Reset', exact: true }).filter({ visible: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(lifetime).toHaveValue('48')
  await lifetime.fill('96')
  await page.getByRole('link', { name: 'Website settings', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lifetime).toHaveValue('96')
})

test('a malformed security draft does not prevent website save or configuration editing', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('ovload.security-authentication.draft', '{invalid'))
  await page.reload()
  await page.getByRole('tab', { name: 'Quick login', exact: true }).click()
  await expect(page.getByLabel('Pending identity lifetime', { exact: true })).toHaveValue('24')
  await page.goto('/general-settings')
  await page.getByRole('tab', { name: 'Register & login', exact: true }).click()
  await page.getByRole('switch', { name: 'GitHub Quick login', exact: true }).check()
  const websiteSave = page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })
  await websiteSave.click()
  await expect(websiteSave).toBeDisabled()
  await page.goto('/security-authentication')
  await page.getByRole('tab', { name: 'Quick login', exact: true }).click()
  await expect(page.getByLabel('Pending identity lifetime', { exact: true })).toHaveValue('24')
})

test('website save preserves previous provider configuration and later saves never overwrite security configuration', async ({ page }) => {
  await page.goto('/general-settings')
  await page.getByRole('tab', { name: 'Register & login', exact: true }).click()
  await page.getByRole('switch', { name: 'GitHub Quick login', exact: true }).check()
  await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click()
  await page.evaluate(() => {
    const key = 'ovload.general-settings.draft'
    const stored = JSON.parse(sessionStorage.getItem(key)!)
    stored.login.identityBindingEnabled = false
    stored.login.pendingIdentityHours = '72'
    stored.login.providers.github.clientId = 'previous-preview-client'
    stored.login.providers.github.callbackUrl = 'https://example.com/callback'
    stored.login.providers.github.clientSecret = 'excluded-preview-value'
    sessionStorage.setItem(key, JSON.stringify(stored))
    sessionStorage.removeItem('ovload.security-authentication.draft')
  })
  await page.reload()
  await page.getByRole('tab', { name: 'Register & login', exact: true }).click()
  await page.getByRole('switch', { name: 'Google Quick login', exact: true }).check()
  await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click()
  await page.goto('/security-authentication')
  await page.getByRole('tab', { name: 'Quick login', exact: true }).click()
  await expect(page.locator('#github-client-id')).toHaveValue('previous-preview-client')
  await expect(page.getByLabel('Pending identity lifetime', { exact: true })).toHaveValue('72')
  await expect(page.getByRole('switch', { name: 'Allow identity binding', exact: true })).not.toBeChecked()
  await page.locator('#github-client-id').fill('updated-preview-client')
  await save(page).click()
  await page.goto('/general-settings')
  await page.getByRole('tab', { name: 'Register & login', exact: true }).click()
  await page.getByRole('switch', { name: 'LinuxDo Quick login', exact: true }).check()
  await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click()
  const state = await page.evaluate(() => ({
    website: JSON.parse(sessionStorage.getItem('ovload.general-settings.draft')!),
    security: JSON.parse(sessionStorage.getItem('ovload.security-authentication.draft')!),
  }))
  expect(state.website.login.providers.github).toEqual({ enabled: true })
  expect(state.security.quickLogin.providers.github).toEqual({ clientId: 'updated-preview-client', callbackUrl: 'https://example.com/callback' })
  expect(state.website.login).not.toHaveProperty('identityBindingEnabled')
})
