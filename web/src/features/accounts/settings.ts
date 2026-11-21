import type { AccountSettings } from '@/api/upstream-accounts'

export const defaultSettings: AccountSettings = {
  notes: '',
  enabled: false,
  concurrencyLimit: 8,
  weight: 1,
  groupIds: [],
  modelAccess: { mode: 'all', models: [] },
}

export function invalidSettings(settings: AccountSettings): string | null {
  if (
    settings.notes.length > 500 ||
    Array.from(settings.notes).some(
      (character) => /\p{Cc}/u.test(character) && !'\n\r\t'.includes(character)
    )
  )
    return 'notes'
  if (
    settings.concurrencyLimit !== null &&
    (!Number.isInteger(settings.concurrencyLimit) ||
      settings.concurrencyLimit < 1 ||
      settings.concurrencyLimit > 4294967295)
  )
    return 'concurrencyLimit'
  if (
    !Number.isInteger(settings.weight) ||
    settings.weight < 1 ||
    settings.weight > 100
  )
    return 'weight'
  const access = settings.modelAccess
  if (
    access.models.length > 256 ||
    (access.mode === 'all'
      ? access.models.length !== 0
      : !access.models.length) ||
    access.models.some(
      (model) =>
        !model ||
        new TextEncoder().encode(model).length > 256 ||
        /[\p{Cc}*]/u.test(model)
    )
  )
    return 'models'
  return null
}
