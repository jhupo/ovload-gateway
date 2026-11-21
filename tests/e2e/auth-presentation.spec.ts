import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../../web/node_modules/@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  for (const mobile of [false, true]) {
    test(`login presentation ${theme} ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/sign-in')
      const email = page.getByRole('textbox', { name: '邮箱', exact: true })
      const password = page.getByLabel('密码', { exact: true })
      await expect(email).toBeVisible()
      await expect(page.locator('.public-scenery canvas')).toBeAttached({ timeout: 15000 })
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await expect(page.getByText('Shadcn Admin')).toHaveCount(0)
      await expect(page.getByText('忘记密码?')).toHaveCount(0)
      for (const name of ['GitHub', 'Google', '使用 Linux DO 登录']) {
        const provider = page.getByRole('button', { name, exact: true })
        await expect(provider).toHaveCount(0)
      }
      await expect(page.locator('.auth-card').getByRole('link', { name: '创建账户', exact: true })).toHaveAttribute('href', '/sign-up')
      const bounds = await page.locator('.auth-card').boundingBox()
      expect(bounds!.width).toBe(mobile ? 342 : 480)
      expect(bounds!.height).toBeGreaterThan(480)
      await page.screenshot({ path: join(tmpdir(), `ovload-auth-${theme}-${mobile ? 'mobile' : 'desktop'}.png`) })
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible()
      await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-y-position', 'bottom')
      await expect(email).toHaveAttribute('aria-invalid', 'true')
      await expect(email).toBeFocused()
      await expect(page.locator('.auth-submit')).toHaveAttribute('data-invalid', 'true')
      await expect(page.locator('[data-slot="form-message"]')).toHaveCount(0)
      await email.fill('reader@example.com')
      await password.fill('example-password')
      await expect(email).toHaveAttribute('aria-invalid', 'false')
      await expect(password).toHaveAttribute('aria-invalid', 'false')
      await expect(page.getByRole('checkbox')).toHaveCount(0)
      await expect(page.locator('[data-slot=card]')).toBeVisible()
      await expect(page.locator('.auth-submit')).toHaveAttribute('data-invalid', 'false')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

      // Exercise Chromium's native autofill styling, not just a typed value.
      const client = await page.context().newCDPSession(page)
      await client.send('DOM.enable')
      await client.send('CSS.enable')
      const { root } = await client.send('DOM.getDocument')
      for (const selector of ['input[name=email]', 'input[name=password]']) {
        const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector })
        await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] })
      }
      await password.blur()
      const oppositeTheme = theme === 'dark' ? 'light' : 'dark'
      for (const activeTheme of [theme, oppositeTheme]) {
        if (activeTheme !== theme) {
          await page.getByRole('button', { name: '切换主题', exact: true }).click()
        }
        await expect(email).toHaveCSS('color-scheme', activeTheme)
        const card = await page.locator('.auth-card').evaluate(element => {
          const style = getComputedStyle(element)
          return { surface: style.backgroundColor, foreground: style.color }
        })
        for (const field of [email, password]) {
          const appearance = await field.evaluate(element => {
            const input = element as HTMLInputElement
            const style = getComputedStyle(input)
            return {
              autofilled: input.matches(':autofill'),
              fill: style.webkitTextFillColor,
              caret: style.caretColor,
              shadow: style.boxShadow,
              labelBottom: input.labels![0].getBoundingClientRect().bottom,
              inputBottom: input.getBoundingClientRect().bottom,
            }
          })
          expect(appearance.autofilled).toBe(true)
          expect(appearance.fill).toBe(card.foreground)
          expect(appearance.caret).toBe(card.foreground)
          expect(appearance.shadow).toContain(card.surface)
          expect(appearance.shadow).toContain('inset')
          expect(appearance.labelBottom).toBeLessThan(appearance.inputBottom - 12)
        }
        if (activeTheme === theme) {
          await page.screenshot({ path: join(tmpdir(), `ovload-auth-autofill-${theme}-${mobile ? 'mobile' : 'desktop'}.png`) })
        }
      }
      await expect(email).toHaveValue('reader@example.com')
      await expect(password).toHaveValue('example-password')
      await client.detach()
      await page.getByRole('button', { name: '语言', exact: true }).click()
      await page.getByRole('menuitem', { name: 'English', exact: true }).click()
      await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('reader@example.com')
      await expect(page.getByLabel('Password', { exact: true })).toHaveValue('example-password')
      await page.locator('.auth-card').getByRole('link', { name: 'Create Account', exact: true }).click()
      await expect(page).toHaveURL(/\/sign-up$/)
      expect(errors).toEqual([])
    })
  }
}
