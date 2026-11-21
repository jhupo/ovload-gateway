import { describe, expect, it } from 'vitest'
import { parseProxyImport, validProxyUrl } from './import'

describe('proxy import contract', () => {
  it('keeps credentials only in the submitted URL, with a redacted preview name', () => {
    const result = parseProxyImport(
      'https://synthetic-user:synthetic-password@proxy.example.com:8443'
    )
    expect(result.invalidLine).toBeNull()
    expect(result.inputs).toHaveLength(1)
    expect(result.inputs[0].name).toBe('proxy.example.com:8443')
    expect(result.inputs[0].proxyUrl).toContain(
      'synthetic-user:synthetic-password@'
    )
  })

  it.each([
    'ftp://proxy.example.com:21',
    'socks5://proxy.example.com',
    'socks5h://proxy.example.com',
    'http://proxy.example.com:0',
    'http://proxy.example.com:65536',
    'http://proxy.example.com/path',
    'http://proxy.example.com?secret=value',
    'http://synthetic-user@proxy.example.com',
    'http://user:pass%0a@proxy.example.com',
  ])('rejects unsupported or invalid input %s', (input) => {
    expect(validProxyUrl(input)).toBe(false)
    expect(parseProxyImport(input)).toEqual({ inputs: [], invalidLine: 1 })
  })

  it('accepts default HTTP ports and explicit SOCKS ports', () => {
    expect(validProxyUrl('https://proxy.example.com')).toBe(true)
    expect(validProxyUrl('socks5://[2001:db8::1]:1080')).toBe(true)
    expect(validProxyUrl('socks5h://proxy.example.com:1080')).toBe(true)
  })

  it('does not partially submit a batch containing a duplicate endpoint', () => {
    expect(
      parseProxyImport(
        'http://one:two@proxy.example.com\nhttp://three:four@proxy.example.com'
      )
    ).toEqual({ inputs: [], invalidLine: 2 })
  })

  it('bounds batch size before dispatch', () => {
    const input = Array.from(
      { length: 101 },
      (_, index) => `http://proxy-${index}.example.com`
    ).join('\n')
    expect(parseProxyImport(input)).toEqual({ inputs: [], invalidLine: 101 })
    expect(parseProxyImport('x'.repeat(64001))).toEqual({
      inputs: [],
      invalidLine: 1,
    })
  })
})
