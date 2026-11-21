import { platformIds } from '@/lib/upstream-platforms'

export const platformValues = ['all', ...platformIds] as const
export const visibilityValues = ['public', 'private'] as const
export const statusValues = ['active', 'disabled'] as const
export const fastModes = ['off', 'allow', 'force'] as const

export type GroupAccount = {
  id: string
  status: 'available' | 'limited' | 'disabled'
  concurrency: number
  inUse: number
}
export type ModelPrice = {
  id: string
  model: string
  inputMicros: number
  outputMicros: number
  cacheReadMicros: number
  cacheWriteMicros: number
}
export type ModelMapping = { id: string; source: string; target: string }
export type Group = {
  id: string
  name: string
  description: string
  platform: (typeof platformValues)[number]
  visibility: (typeof visibilityValues)[number]
  status: (typeof statusValues)[number]
  rateBps: number
  rpm: number
  accounts: GroupAccount[]
  usage: { todayCents: number; yesterdayCents: number; totalCents: number }
  billing: {
    images: boolean
    imageMicros: [number, number, number]
    search: boolean
    searchMicros: number
    peak: boolean
    peakStart: string
    peakEnd: string
    timeZone: string
    peakRateBps: number
    offPeakRateBps: number
  }
  modelPrices: ModelPrice[]
  fast: (typeof fastModes)[number]
  live: boolean
  mappings: ModelMapping[]
  overrides: { userId: string; rateBps: number | null; rpm: number | null }[]
}

export function accountSummary(accounts: GroupAccount[]) {
  return accounts.reduce(
    (summary, account) => ({
      available: summary.available + Number(account.status === 'available'),
      limited: summary.limited + Number(account.status === 'limited'),
      total: summary.total + 1,
      capacity:
        summary.capacity +
        (account.status === 'available' ? account.concurrency : 0),
      used: summary.used + account.inUse,
    }),
    { available: 0, limited: 0, total: 0, capacity: 0, used: 0 }
  )
}
