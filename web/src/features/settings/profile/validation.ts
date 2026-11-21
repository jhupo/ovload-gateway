export function usernameError(value: string) {
  const username = value.trim()
  const length = Array.from(username).length
  return length < 2 || length > 30 || /\p{Cc}|\p{Cf}/u.test(username)
}

export async function readProfileAvatar(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('avatarType')
  if (!file.size || file.size > 2 * 1024 * 1024) throw new Error('avatarSize')
  try {
    const bitmap = await createImageBitmap(file)
    const oversized = bitmap.width > 4096 || bitmap.height > 4096
    bitmap.close()
    if (oversized) throw new Error('avatarDimensions')
  } catch (error) {
    if (error instanceof Error && error.message === 'avatarDimensions')
      throw error
    throw new Error('avatarInvalid', { cause: error })
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('avatarInvalid'))
    reader.onerror = () => reject(new Error('avatarInvalid'))
    reader.onabort = () => reject(new Error('avatarInvalid'))
    reader.readAsDataURL(file)
  })
}
