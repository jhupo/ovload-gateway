import type { CustomerSummary } from '@/api/customers'

export type UserRole = 'user'
export type UserStatus = 'active' | 'suspended' | 'revoked'
export type User = {
  id: string
  tenantId: string
  record: CustomerSummary
  username: string
  email: string
  avatarUrl?: string
  role: UserRole
  status: UserStatus
  concurrencyLimit: number
  rpmLimit: number
  notes: string
  balanceUsd: string | null
  createdAt: Date
  lastActiveAt: Date | null
  lastCalledAt: Date | null
}
