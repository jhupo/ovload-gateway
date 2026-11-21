import type { ProxyInput } from '@/api/proxies'

export function hasProxyControlCharacters(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function validProxyUrl(value: string) {
  if (
    !value ||
    value.length > 2048 ||
    hasProxyControlCharacters(value) ||
    value.includes(' ') ||
    value.includes('\\')
  )
    return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) &&
      !!url.hostname &&
      !!(url.port || ['http:', 'https:'].includes(url.protocol)) &&
      (!url.port || Number(url.port) > 0) &&
      !url.search &&
      !url.hash &&
      (url.pathname === '' || url.pathname === '/') &&
      !!url.username === !!url.password &&
      !hasProxyControlCharacters(
        decodeURIComponent(url.username + url.password)
      )
    )
  } catch {
    return false
  }
}

export function parseProxyImport(text: string): {
  inputs: (ProxyInput & { proxyUrl: string })[]
  invalidLine: number | null
} {
  if (text.length > 64000) return { inputs: [], invalidLine: 1 }
  const inputs: (ProxyInput & { proxyUrl: string })[] = []
  const lines = text.split(/\r?\n/)
  const seen = new Set<string>()
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line) continue
    if (inputs.length >= 100 || !validProxyUrl(line))
      return { inputs: [], invalidLine: index + 1 }
    const endpoint = new URL(line)
    endpoint.username = ''
    endpoint.password = ''
    const key = endpoint.toString()
    if (seen.has(key)) return { inputs: [], invalidLine: index + 1 }
    seen.add(key)
    inputs.push({
      name: endpoint.host,
      proxyUrl: line,
      maxWebsocketConnections: 0,
      autoLocation: true,
      enabled: true,
    })
  }
  return { inputs, invalidLine: null }
}
