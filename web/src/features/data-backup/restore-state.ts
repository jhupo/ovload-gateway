import type { RestoreAccepted } from '@/api/backups'

const key = 'ovload.database-restore'
export function trackDatabaseRestore(job: RestoreAccepted) {
  sessionStorage.setItem(key, JSON.stringify(job))
  window.location.assign('/sign-in')
}
export function clearDatabaseRestore() {
  sessionStorage.removeItem(key)
}
export function pendingDatabaseRestore(): RestoreAccepted | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (
      value &&
      typeof value === 'object' &&
      'id' in value &&
      'ticket' in value &&
      typeof value.id === 'string' &&
      typeof value.ticket === 'string' &&
      /^[a-f0-9-]{36}$/.test(value.id) &&
      /^[a-f0-9]{64}$/.test(value.ticket)
    )
      return { id: value.id, ticket: value.ticket }
  } catch {
    /* Malformed browser state cannot authorize an operation. */
  }
  return null
}
