import { useQuery } from '@tanstack/react-query'
import { listAccountGroups, type AccountGroup } from '@/api/account-groups'
import { customersApi } from '@/api/customers'
import { allows, useIdentitySession } from '@/stores/identity-session'
import type { User } from '@/api/contracts/users'
import { useErrorToast } from './use-error-toast'

export function useSettingsGroups() {
  const owner = useIdentitySession((state) => state.session?.id)
  const query = useQuery({
    queryKey: ['settings-group-options', owner],
    enabled: !!owner && allows('provider_accounts.read'),
    queryFn: async ({ signal }) => {
      const items: AccountGroup[] = []
      let page = 1
      let totalPages: number
      do {
        const result = await listAccountGroups(
          { page, pageSize: 200, sort: 'name' },
          signal
        )
        items.push(...result.items)
        totalPages = result.page.totalPages
        page++
      } while (page <= totalPages)
      return items
    },
  })
  useErrorToast(query.error?.message, 'settings-group-options')
  return query.data ?? []
}

export function useSettingsUsers() {
  const owner = useIdentitySession((state) => state.session?.id)
  const query = useQuery({
    queryKey: ['settings-customer-options', owner],
    enabled: !!owner && allows('identity.users.read'),
    queryFn: async ({ signal }) => {
      const users: User[] = []
      let page = 1
      let total: number
      do {
        const result = await customersApi.list({ page, page_size: 100 }, signal)
        total = result.total
        users.push(
          ...result.items.map(
            (record): User => ({
              id: record.id,
              tenantId: record.tenant_id,
              record,
              username: record.display_name,
              email: record.email,
              role: 'user',
              status: record.status,
              concurrencyLimit: record.max_concurrency,
              rpmLimit: record.requests_per_minute,
              notes: record.notes,
              balanceUsd: record.balance_usd,
              createdAt: new Date(record.created_at),
              lastActiveAt: record.last_active_at
                ? new Date(record.last_active_at)
                : null,
              lastCalledAt: record.last_called_at
                ? new Date(record.last_called_at)
                : null,
            })
          )
        )
        page++
        if (!result.items.length) break
      } while (users.length < total)
      return users
    },
  })
  useErrorToast(query.error?.message, 'settings-customer-options')
  return query.data ?? []
}
