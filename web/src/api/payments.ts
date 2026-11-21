import { apiRequest } from './client'

export type PaymentQuote = {
  amountCny: string
  feeCny: string
  totalCny: string
  creditUsd: string
  bonusPercent: string
}
export type PaymentOrder = Omit<PaymentQuote, 'bonusPercent'> & {
  id: string
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed'
  checkout?: { mode: 'qrcode' | 'redirect'; url: string }
  createdAt: string
  expiresAt: string
  paidAt: string | null
}
export type PaymentConfig = {
  enabled: boolean
  minAmount: string
  maxAmount: string
  dailyLimit: string
  rechargeMultiplier: string
  feeRate: string
  tiers: { amount: string; percent: string }[]
  userOffers: { amount: string; percent: string }[]
}
export const payments = {
  config: async (signal?: AbortSignal) =>
    (
      await apiRequest<PaymentConfig>('customer', '/payments/config', {
        signal,
      })
    ).data,
  orders: async (signal?: AbortSignal) =>
    (
      await apiRequest<PaymentOrder[]>('customer', '/payments/orders', {
        signal,
      })
    ).data,
  command: async <T>(body: unknown, signal?: AbortSignal) =>
    (
      await apiRequest<T>('customer', '/payments', {
        method: 'POST',
        body,
        signal,
      })
    ).data,
}
