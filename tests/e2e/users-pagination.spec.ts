import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../../web/node_modules/@playwright/test'

const captures = join(tmpdir(), 'ovload-users-redesign-pagination')

for (const mobile of [false, true]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`users pagination stays filled: ${mobile ? 'mobile' : 'desktop'} ${theme}`, async ({ page }) => {
      await mkdir(captures, { recursive: true })
      const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'zh')
        sessionStorage.setItem('ovload.admin-preview', 'active')
      })
      await page.goto('/users')
      const rows = page.getByTestId('user-row')
      const frame = page.getByTestId('users-table-viewport')
      const scroll = frame.locator(mobile ? '[data-users-mobile]' : '[data-slot="table-container"]')
      const next = page.getByRole('button', { name: '下一页', exact: true })
      const capture = async (state: string) => {
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
        })
        await page.screenshot({ path: join(captures, `${mobile ? 'mobile' : 'desktop'}-${theme}-${state}.png`) })
      }
      await expect(rows).toHaveCount(10)
      const initialFrame = await frame.boundingBox()
      const initialPager = await next.boundingBox()
      const rowHeight = (await rows.first().boundingBox())!.height
      await capture('first')
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
      if (!mobile) await expect.poll(async () => (await frame.locator('thead').boundingBox())!.y).toBeCloseTo(initialFrame!.y + 1, 0)
      await next.click()
      await expect(rows.first()).toContainText(mobile ? 'kai.huang' : '1011')
      await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBe(0)
      await next.click()
      await expect(rows).toHaveCount(4)
      expect(await frame.boundingBox()).toEqual(initialFrame)
      expect(await next.boundingBox()).toEqual(initialPager)
      expect((await rows.first().boundingBox())!.height).toBeCloseTo(rowHeight, 0)
      await expect(next).toBeDisabled()
      await capture('last')
      await page.getByRole('combobox', { name: '每页行数', exact: true }).click()
      await page.getByRole('option', { name: '30', exact: true }).click()
      await expect(rows).toHaveCount(24)
      expect(await frame.boundingBox()).toEqual(initialFrame)
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
      await expect(rows.last()).toBeInViewport()
      await expect(next).toBeInViewport()
      await capture('large-page')
      await page.getByRole('textbox', { name: '搜索 ID、用户名或邮箱' }).fill('missing-user')
      await expect(rows).toHaveCount(0)
      await expect(page.getByText('无结果。', { exact: true })).toBeVisible()
      await expect(page.getByText('无结果。', { exact: true })).toBeInViewport({ ratio: 1 })
      await capture('empty')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
      const emptyFrame = (await frame.boundingBox())!
      expect(emptyFrame.height).toBeGreaterThan(200)
      expect((await next.boundingBox())!.y).toBeCloseTo(initialPager!.y, 0)
    })
  }
}
