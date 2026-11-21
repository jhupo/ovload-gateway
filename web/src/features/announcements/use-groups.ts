import { useQuery } from '@tanstack/react-query'
import {
  listAccountGroupOptions,
  type AccountGroupOption,
} from '@/api/account-groups'
import { useIdentitySession } from '@/stores/identity-session'
import { useErrorToast } from '@/hooks/use-error-toast'

export function useAnnouncementGroups() {
  const session = useIdentitySession((s) => s.session)
  const query = useQuery({
    queryKey: ['announcement-groups', session?.id],
    queryFn: async ({ signal }) => {
      const items: AccountGroupOption[] = []
      let page = 1
      while (true) {
        const result = await listAccountGroupOptions(
          { page, pageSize: 100 },
          signal
        )
        items.push(...result.items)
        if (page >= result.page.totalPages) return items
        page++
      }
    },
    enabled: session?.audience === 'management',
  })
  useErrorToast(query.error?.message, 'announcement-groups')
  return query.data ?? []
}
