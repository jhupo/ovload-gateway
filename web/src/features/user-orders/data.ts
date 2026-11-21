export const personalOrderStatuses = [
  'paid',
  'pending',
  'cancelled',
  'refunded',
  'expired',
  'failed',
] as const
export type PersonalOrderStatus = (typeof personalOrderStatuses)[number]
export type PersonalOrder = {
  id: string
  type: 'balance' | 'plan'
  plan: string | null
  amountCents: number
  feeCents: number
  creditCents: number | null
  currency?: 'USD' | 'CNY'
  method: 'alipay' | 'wechat' | 'wallet'
  status: PersonalOrderStatus
  createdAt: string
  paidAt: string | null
  subscriptionId: string | null
}

export const personalOrders: PersonalOrder[] = []
