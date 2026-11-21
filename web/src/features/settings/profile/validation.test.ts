import { afterEach, expect, test, vi } from 'vitest'
import { readProfileAvatar, usernameError } from './validation'

afterEach(() => vi.restoreAllMocks())

test('usernames trim whitespace and count Unicode code points within limits', () => {
  for (const name of ['', ' x ', 'a'.repeat(31), 'ab\u0000cd', 'ab\u202ecd'])
    expect(usernameError(name)).toBe(true)
  for (const name of [' ab ', '用户', '😀'.repeat(30)])
    expect(usernameError(name)).toBe(false)
})

test('avatar validation rejects unsupported, empty, oversized and corrupt images', async () => {
  await expect(
    readProfileAvatar(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))
  ).rejects.toThrow('avatarType')
  await expect(
    readProfileAvatar(new File([], 'x.png', { type: 'image/png' }))
  ).rejects.toThrow('avatarSize')
  await expect(
    readProfileAvatar(
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'x.png', {
        type: 'image/png',
      })
    )
  ).rejects.toThrow('avatarSize')
  await expect(
    readProfileAvatar(new File(['corrupt'], 'x.png', { type: 'image/png' }))
  ).rejects.toThrow('avatarInvalid')
})

test('decoded image dimensions are bounded and bitmaps are always closed', async () => {
  const close = vi.fn()
  vi.spyOn(globalThis, 'createImageBitmap').mockResolvedValue({
    width: 4097,
    height: 1,
    close,
  } as unknown as ImageBitmap)
  await expect(
    readProfileAvatar(new File(['x'], 'x.png', { type: 'image/png' }))
  ).rejects.toThrow('avatarDimensions')
  expect(close).toHaveBeenCalledOnce()
})

test('valid images decode and stay in memory as data URLs', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), 'image/png')
  )
  const result = await readProfileAvatar(
    new File([blob], 'avatar.png', { type: 'image/png' })
  )
  expect(result).toMatch(/^data:image\/png;base64,/)
})
