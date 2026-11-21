import type { CustomerSummary } from '@/api/customers'

export const roleValues = ['user'] as const
export const statusValues = ['active', 'suspended', 'revoked'] as const
export type UserRole = (typeof roleValues)[number]

export type User = {
  id: string
  tenantId: string
  record: CustomerSummary
  username: string
  email: string
  avatarUrl?: string
  role: UserRole
  status: (typeof statusValues)[number]
  concurrencyLimit: number
  rpmLimit: number
  notes: string
  balanceUsd: string | null
  createdAt: Date
  lastActiveAt: Date | null
  lastCalledAt: Date | null
}
