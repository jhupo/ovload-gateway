import { describe, expect, it } from 'vitest'
import { defaultProfile, requestProfileErrors } from './profile-draft'

describe('request profile validation', () => {
  it('validates native OAuth presets without accepting arbitrary headers', () => {
    for (const provider of ['claude', 'gemini'] as const) {
      expect(requestProfileErrors(provider, defaultProfile(provider))).toEqual(
        {}
      )
      expect(requestProfileErrors(provider, { preset: 'macos-arm64' })).toEqual(
        {}
      )
      expect(
        requestProfileErrors(provider, { preset: 'unknown' })
      ).toHaveProperty('preset')
      expect(
        requestProfileErrors(provider, {
          preset: 'linux-x64',
          apiKey: 'secret',
        })
      ).toHaveProperty('preset')
    }
  })
  it('accepts the provider defaults and optional fields', () => {
    expect(requestProfileErrors('openai', defaultProfile('openai'))).toEqual({})
    expect(requestProfileErrors('xai', defaultProfile('xai'))).toEqual({})
    expect(requestProfileErrors('openai', null)).toEqual({})
  })

  it('keeps latest and fixed version parameters mutually exclusive', () => {
    expect(
      requestProfileErrors('openai', {
        ...defaultProfile('openai'),
        codexVersion: '1.2.3',
      })
    ).toHaveProperty('codexVersion')
    expect(
      requestProfileErrors('openai', {
        ...defaultProfile('openai'),
        versionMode: 'fixed',
        codexVersion: '1.2.3',
        desktopVersion: '1.2.3',
        desktopBuild: '7',
        versionLag: 1,
      })
    ).toHaveProperty('versionLag')
    expect(
      requestProfileErrors('xai', {
        ...defaultProfile('xai'),
        versionMode: 'fixed',
        clientVersion: '',
      })
    ).toHaveProperty('clientVersion')
    expect(
      requestProfileErrors('xai', {
        ...defaultProfile('xai'),
        versionMode: 'fixed',
        clientVersion: '1.2.3',
      })
    ).toEqual({})
  })

  it('requires complete Desktop fixed versions and valid version lag', () => {
    expect(
      requestProfileErrors('openai', {
        ...defaultProfile('openai'),
        versionMode: 'fixed',
        codexVersion: '1.2.3',
      })
    ).toEqual({
      desktopVersion: 'invalidDesktopVersion',
      desktopBuild: 'invalidBuild',
    })
    expect(
      requestProfileErrors('openai', {
        ...defaultProfile('openai'),
        versionLag: 11,
      })
    ).toHaveProperty('versionLag')
    expect(
      requestProfileErrors('openai', {
        ...defaultProfile('openai'),
        versionLag: 2,
      })
    ).toEqual({})
  })

  it('rejects header injection and incomplete unknown User-Agents', () => {
    expect(
      requestProfileErrors('openai', {
        mode: 'custom',
        userAgent: 'agent/1.2.3\r\nAuthorization: secret',
      })
    ).toHaveProperty('userAgent')
    expect(
      requestProfileErrors('openai', {
        mode: 'custom',
        userAgent: 'agent/1.2.3',
      })
    ).toEqual({ originator: 'invalidIdentity', codexVersion: 'invalidVersion' })
    expect(
      requestProfileErrors('openai', {
        mode: 'custom',
        userAgent: 'agent/1.2.3',
        originator: 'agent',
        codexVersion: '1.2.3',
      })
    ).toEqual({})
    expect(
      requestProfileErrors('xai', {
        ...defaultProfile('xai'),
        targetOs: 'linux\r\n',
      })
    ).toHaveProperty('targetOs')
  })

  it('checks companion headers for recognized User-Agents', () => {
    expect(
      requestProfileErrors('openai', {
        mode: 'custom',
        userAgent: 'codex_exec/1.2.3',
      })
    ).toEqual({})
    expect(
      requestProfileErrors('openai', {
        mode: 'custom',
        userAgent: 'codex_exec/1.2.3',
        codexVersion: '1.2.4',
      })
    ).toHaveProperty('codexVersion')
    expect(
      requestProfileErrors('openai', {
        mode: 'custom',
        userAgent: 'codex_exec/1.2.3',
        originator: 'codex-tui',
      })
    ).toHaveProperty('originator')
  })
})
