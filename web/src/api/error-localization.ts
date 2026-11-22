import i18n from '@/i18n'

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function codeValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return String(value)
  return stringValue(value)
}

function translationKey(errorKey: string): string | undefined {
  if (!errorKey.startsWith('admin.')) return undefined
  const suffix = errorKey.slice('admin.'.length)
  return suffix.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function interpolationValues(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (typeof item === 'string' || typeof item === 'number') return [[key, item]]
      return []
    })
  )
}

export function localizeAdminError(
  code: string,
  status: number,
  fallback: string,
  errorKey?: string,
  params?: unknown
) {
  if (code.startsWith('identity.')) {
    return i18n.t(`identity.errors.${code.slice(9)}`, {
      defaultValue: fallback,
    })
  }
  // Provider OAuth failures carry a reviewed, stage-specific public message.
  // Keep it instead of replacing it with the generic 502 translation.
  if (code === '50201' && fallback.trim()) return fallback
  const adminKeys: Record<string, string> = {
    '40000': 'malformedJson',
    '40001': 'badRequest',
    '40002': 'invalidTimeRange',
    '40003': 'invalidModelSource',
    '40101': 'sessionRequired',
    '40102': 'invalidCredentials',
    '40103': 'invalidApiKey',
    '40301': 'forbidden',
    '40401': 'notFound',
    '40901': 'conflict',
    '42901': 'tooManyLoginAttempts',
    '42902': 'rateLimited',
    '50000': 'settingsPersist',
    '50001': 'internal',
    '50002': 'usageRecordAccounts',
    '50201': 'badGateway',
    '50202': 'upstreamResultUnknown',
    '50301': 'serviceUnavailable',
  }
  const key = adminKeys[code] ?? (status >= 500 ? 'internal' : 'badRequest')
  const stableKey = errorKey ? translationKey(errorKey) : undefined
  return i18n.t(`adminErrors.${stableKey ?? key}`, {
    ...interpolationValues(params),
    defaultValue: fallback,
  })
}
