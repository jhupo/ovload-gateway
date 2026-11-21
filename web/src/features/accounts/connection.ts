export { defaultApiBaseUrl } from '@/lib/upstream-platforms'

export function validApiBaseUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !!url.hostname &&
      url.port !== '0' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      value.trim() === value &&
      value.length <= 2048
    )
  } catch {
    return false
  }
}

export function validApiKey(value: string) {
  return /^[\x21-\x7e]+$/.test(value) && value.length <= 16384
}
