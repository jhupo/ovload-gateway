import type { UpstreamAccount } from '@/api/upstream-accounts'

export type AccountQuotaWindow = UpstreamAccount['quota']['windows'][number]

export const FIVE_HOUR_WINDOW_SECONDS = 18_000
export const WEEKLY_WINDOW_SECONDS = 604_800

// Keep each quota bucket together, with its shorter window before its weekly
// window. The duration comes from the provider; the UI never guesses a window.
export function orderedQuotaWindows(windows: readonly AccountQuotaWindow[]) {
  return [...windows].sort((left, right) => {
    const leftBucket = left.limitId ?? ''
    const rightBucket = right.limitId ?? ''
    if (leftBucket !== rightBucket)
      return leftBucket.localeCompare(rightBucket, 'en-US')
    const leftDuration = left.windowSeconds ?? Number.POSITIVE_INFINITY
    const rightDuration = right.windowSeconds ?? Number.POSITIVE_INFINITY
    if (leftDuration !== rightDuration) return leftDuration - rightDuration
    return 0
  })
}

export function quotaWindowPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

export function summaryQuotaWindows(windows: readonly AccountQuotaWindow[]) {
  const ordered = orderedQuotaWindows(windows)
  const fiveHour = ordered.find(
    (window) => window.windowSeconds === FIVE_HOUR_WINDOW_SECONDS
  )
  const weekly = ordered.find(
    (window) => window.windowSeconds === WEEKLY_WINDOW_SECONDS
  )
  if (fiveHour && weekly) return [fiveHour, weekly]
  const primary =
    fiveHour ??
    weekly ??
    ordered.find((window) => window.role === 'primary') ??
    ordered[0]
  return primary ? [primary] : []
}
