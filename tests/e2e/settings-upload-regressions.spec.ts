import { expect, test, type Page } from '../../web/node_modules/@playwright/test'

type DelayedImage = { ready: boolean; release: () => void }
type ImageWindow = Window & { reviewImages: DelayedImage[] }

const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })
const discard = async (page: Page) => {
  await page.getByRole('button', { name: 'Discard changes', exact: true }).filter({ visible: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click()
}
async function selectLogo(page: Page, color: string) {
  const index = await page.evaluate(() => (window as ImageWindow).reviewImages.length)
  await page.locator('input[type=file]').setInputFiles({
    name: 'sample.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="${color}"/></svg>`),
  })
  await page.waitForFunction(index => (window as ImageWindow).reviewImages[index]?.ready, index)
  return index
}
async function release(page: Page, index: number) {
  await page.evaluate(index => (window as ImageWindow).reviewImages[index].release(), index)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
    const OriginalImage = window.Image
    const state = window as ImageWindow
    state.reviewImages = []
    window.Image = function () {
      const image = new OriginalImage()
      let callback: ((event: Event) => void) | null = null
      const delayed: DelayedImage = { ready: false, release: () => callback?.call(image, new Event('load')) }
      state.reviewImages.push(delayed)
      Object.defineProperty(image, 'onload', { get: () => callback, set: value => { callback = value } })
      image.addEventListener('load', () => { delayed.ready = true })
      return image
    } as typeof Image
  })
  await page.goto('/general-settings')
})

for (const width of [1440, 390]) {
  test(`discard cancels a pending logo selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const first = await selectLogo(page, 'red')
    await expect(save(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Discard changes', exact: true }).filter({ visible: true })).toBeEnabled()
    if (width === 1440) {
      await page.getByRole('link', { name: 'Channel status', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await discard(page)
    const second = await selectLogo(page, 'blue')
    await release(page, first)
    await expect(save(page)).toBeDisabled()
    await expect(page.locator('#site-logo img')).toHaveCount(0)
    await release(page, second)
    await expect(save(page)).toBeEnabled()
    await discard(page)
    await expect(page.locator('#site-logo img')).toHaveCount(0)
    await expect(save(page)).toBeDisabled()
  })
}

test('the last logo wins out of order and removal cancels pending replacements', async ({ page }) => {
  const first = await selectLogo(page, 'red')
  const second = await selectLogo(page, 'blue')
  await release(page, second)
  const image = page.locator('#site-logo img')
  await expect(image).toBeVisible()
  const source = await image.getAttribute('src')
  await release(page, first)
  await expect(image).toHaveAttribute('src', source!)
  await save(page).click()
  await expect(save(page)).toBeDisabled()
  const replacement = await selectLogo(page, 'green')
  await page.getByRole('button', { name: 'Remove image', exact: true }).click()
  await release(page, replacement)
  await expect(image).toHaveCount(0)
  await save(page).click()
  await page.reload()
  await expect(image).toHaveCount(0)
})
