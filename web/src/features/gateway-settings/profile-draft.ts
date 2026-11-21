import type {
  ProfileConfiguration,
  ProfileOptions,
  ProfileProvider,
} from './profile-api'

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const present = (value: unknown) => value !== null && value !== undefined
const version = (value: unknown) =>
  typeof value === 'string' && value.length <= 64 && semver.test(value)
const safeHeader = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  value === value.trim() &&
  /^[\x20-\x7e]+$/.test(value)

export function profileText(value: ProfileConfiguration, key: string): string {
  return typeof value[key] === 'string' ? value[key] : ''
}

export function defaultProfile(
  provider: ProfileProvider,
  options?: ProfileOptions
): ProfileConfiguration {
  if (provider === 'gemini' || provider === 'claude')
    return options?.defaults ?? { preset: 'linux-x64' }
  if (provider === 'xai')
    return (
      options?.defaults ?? {
        versionMode: 'latest',
        clientVersion: null,
        clientIdentifier: 'grok-shell',
        clientMode: 'headless',
        targetOs: 'linux',
        targetArch: 'x86_64',
      }
    )
  return (
    options?.presets?.find(
      ({ configuration }) =>
        configuration.client === 'desktop' && configuration.platform === 'macos'
    )?.configuration ?? {
      client: 'desktop',
      platform: 'macos',
      versionMode: 'latest',
      versionLag: null,
      cliEntry: null,
      originator: null,
      osType: null,
      osVersion: null,
      arch: null,
      terminal: null,
      codexVersion: null,
      desktopVersion: null,
      desktopBuild: null,
    }
  )
}

export function openaiPreset(
  value: ProfileConfiguration | null | undefined
): ProfileConfiguration {
  if (
    value &&
    value.mode === undefined &&
    value.versionMode === 'latest' &&
    [
      'originator',
      'osType',
      'osVersion',
      'arch',
      'terminal',
      'codexVersion',
      'desktopVersion',
      'desktopBuild',
    ].every((key) => value[key] == null)
  )
    return value
  const base =
    value?.mode === 'custom'
      ? defaultProfile('openai')
      : (value ?? defaultProfile('openai'))
  return {
    ...defaultProfile('openai'),
    client: base.client,
    platform: base.platform,
    cliEntry: base.cliEntry ?? null,
    versionLag: base.versionLag ?? null,
    versionMode: 'latest',
  }
}

export function requestProfileErrors(
  provider: ProfileProvider,
  value: ProfileConfiguration | null | undefined
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!value) return errors
  if (provider === 'gemini' || provider === 'claude') {
    if (
      !['linux-x64', 'macos-arm64', 'windows-x64'].includes(
        String(value.preset)
      ) ||
      Object.keys(value).some((key) => key !== 'preset')
    )
      errors.preset = 'required'
    return errors
  }
  if (provider === 'xai') {
    for (const key of [
      'clientIdentifier',
      'clientMode',
      'targetOs',
      'targetArch',
    ]) {
      if (
        typeof value[key] !== 'string' ||
        value[key].length > 64 ||
        !/^[\x21-\x7e]+$/.test(value[key])
      )
        errors[key] = 'invalidIdentity'
    }
    if (value.versionMode !== 'latest' && value.versionMode !== 'fixed')
      errors.versionMode = 'required'
    if (value.versionMode === 'latest' && present(value.clientVersion))
      errors.clientVersion = 'fixedVersionOnly'
    if (value.versionMode === 'fixed' && !version(value.clientVersion))
      errors.clientVersion = 'invalidVersion'
    return errors
  }
  if (present(value.mode)) {
    if (value.mode !== 'custom') errors.mode = 'required'
    if (!safeHeader(value.userAgent, 4096))
      errors.userAgent = 'invalidUserAgent'
    const userAgent = profileText(value, 'userAgent')
    const known = [
      'Codex Desktop',
      'codex-tui',
      'codex_exec',
      'codex_cli_rs',
    ].find((name) => userAgent.startsWith(name + '/'))
    if (known) {
      const coreVersion = userAgent.slice(known.length + 1).split(' ')[0]
      if (!version(coreVersion)) errors.userAgent = 'invalidVersion'
      if (present(value.originator) && value.originator !== known)
        errors.originator = 'conflictingIdentity'
      if (present(value.codexVersion) && value.codexVersion !== coreVersion)
        errors.codexVersion = 'conflictingIdentity'
    } else {
      if (!safeHeader(value.originator, 128))
        errors.originator = 'invalidIdentity'
      if (!version(value.codexVersion)) errors.codexVersion = 'invalidVersion'
    }
    return errors
  }
  if (value.client !== 'desktop' && value.client !== 'cli')
    errors.client = 'required'
  if (!['macos', 'linux', 'windows'].includes(profileText(value, 'platform')))
    errors.platform = 'required'
  for (const key of ['originator', 'osType', 'osVersion', 'arch', 'terminal']) {
    if (
      present(value[key]) &&
      (!safeHeader(value[key], 128) || /[();\\]/.test(String(value[key])))
    )
      errors[key] = 'invalidIdentity'
  }
  if (
    present(value.cliEntry) &&
    (!['tui', 'exec'].includes(profileText(value, 'cliEntry')) ||
      value.client === 'desktop')
  )
    errors.cliEntry = 'required'
  if (value.versionMode === 'fixed') {
    if (present(value.versionLag)) errors.versionLag = 'latestVersionOnly'
    if (!version(value.codexVersion)) errors.codexVersion = 'invalidVersion'
    if (value.client === 'desktop') {
      const desktopVersion = profileText(value, 'desktopVersion')
      if (desktopVersion.length > 64 || !/^\d+(?:\.\d+)+$/.test(desktopVersion))
        errors.desktopVersion = 'invalidDesktopVersion'
      if (!/^\d{1,32}$/.test(profileText(value, 'desktopBuild')))
        errors.desktopBuild = 'invalidBuild'
    }
  } else if (value.versionMode === 'latest') {
    for (const key of ['codexVersion', 'desktopVersion', 'desktopBuild'])
      if (present(value[key])) errors[key] = 'fixedVersionOnly'
    if (
      present(value.versionLag) &&
      (!Number.isInteger(value.versionLag) ||
        Number(value.versionLag) < 1 ||
        Number(value.versionLag) > 10)
    )
      errors.versionLag = 'invalidLag'
  } else errors.versionMode = 'required'
  if (value.client === 'cli')
    for (const key of ['desktopVersion', 'desktopBuild'])
      if (present(value[key])) errors[key] = 'desktopOnly'
  return errors
}
