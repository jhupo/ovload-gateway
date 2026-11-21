import { apiRequest } from './client'

export type WalletBalance = {
  tenant_id: string
  currency: 'USD'
  scale: 10
  settled_usd: string
  held_usd: string
  available_usd: string
}

export async function getWalletBalance(signal?: AbortSignal) {
  return (
    await apiRequest<WalletBalance>('customer', '/billing/balance', { signal })
  ).data
}
