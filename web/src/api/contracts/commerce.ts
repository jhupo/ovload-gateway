export type OrderStatus = 'paid' | 'pending' | 'cancelled' | 'refunded'
export type Order = {
  id: string
  number: string
  user: string
  email: string
  type: 'balance' | 'plan'
  plan: string
  credited: number
  paid: number
  fee?: number
  currency?: 'USD' | 'CNY'
  subscriptionId?: string
  method: 'alipay' | 'wechat' | 'wallet'
  status: OrderStatus
  created: string
  settled: string | null
}

export type CodeType = 'balance' | 'concurrency' | 'subscription' | 'invitation'
export type Redemption = { id: string; user: string; email: string; at: string }
export type RedemptionCode = {
  id: string
  revision?: number
  code: string
  type: CodeType
  value: number
  planName: string
  maxUses: number
  perUser: number
  disabled: boolean
  expiresAt: string | null
  createdAt: string
  notes: string
  used?: number
  history: Redemption[]
}

export type Plan = {
  subscriberCount?: number
  id: string
  revision?: number
  name: string
  originalPriceCents: number
  weeklyCents: number
  unlimited: { daily: boolean; weekly: boolean; monthly: boolean }
  sort: number
  currencyLabel: string
  features: string
  priceCents: number
  days: number
  dailyCents: number
  monthlyCents: number
  resetTime: string
  timezone: 'Asia/Shanghai' | 'UTC'
  description: string
  notes: string
  published: boolean
}
export type Subscription = {
  id: string
  revision?: number
  userId: string
  plan: Plan
  start: string
  end: string
  weeklyUsed?: number
  dailyUsed: number
  monthlyUsed: number
  revoked: boolean
  notes: string
}
