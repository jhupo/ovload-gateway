export const quotaPeriods = ['daily', 'weekly', 'monthly'] as const
export type QuotaPeriod = (typeof quotaPeriods)[number]
export type SubscriptionStatus = 'active' | 'scheduled' | 'expired' | 'revoked'
export type UserSubscription = {
  id: string
  plan: string
  priceCents: number
  startsAt: string
  expiresAt: string
  revoked: boolean
  quotas: Record<
    QuotaPeriod,
    { limitMicros: number | null; usedMicros: number }
  >
}

export const personalSubscriptions: UserSubscription[] = []

export function personalSubscriptionStatus(
  record: UserSubscription,
  now = Date.now()
): SubscriptionStatus {
  if (record.revoked) return 'revoked'
  if (Date.parse(record.expiresAt) <= now) return 'expired'
  return Date.parse(record.startsAt) > now ? 'scheduled' : 'active'
}

export function partitionSubscriptions(
  records: UserSubscription[],
  now = Date.now()
) {
  const current: UserSubscription[] = [],
    history: UserSubscription[] = []
  for (const record of records) {
    const status = personalSubscriptionStatus(record, now)
    ;(status === 'active' || status === 'scheduled' ? current : history).push(
      record
    )
  }
  return {
    current,
    history: history.sort(
      (left, right) => Date.parse(right.expiresAt) - Date.parse(left.expiresAt)
    ),
  }
}

export function quotaState(quota: UserSubscription['quotas'][QuotaPeriod]) {
  if (quota.limitMicros === null)
    return { percent: null, remainingMicros: null, exhausted: false }
  return {
    percent:
      quota.limitMicros === 0
        ? 100
        : Math.min(
            100,
            Math.max(0, (quota.usedMicros / quota.limitMicros) * 100)
          ),
    remainingMicros: Math.max(0, quota.limitMicros - quota.usedMicros),
    exhausted: quota.usedMicros >= quota.limitMicros,
  }
}
