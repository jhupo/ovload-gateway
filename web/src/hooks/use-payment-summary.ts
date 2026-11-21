import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import { useIdentitySession } from '@/stores/identity-session'
import { useErrorToast } from './use-error-toast'

type PaymentSummary = {
  total: number
  count: number
  today: number
  days: { day: string; revenue: number; count: number }[]
  ranking: {
    id: string
    name: string
    email: string
    total: number
    count: number
  }[]
}
export function usePaymentSummary(from: string, to: string, today: string) {
  const session = useIdentitySession((s) => s.session)
  const query = useQuery({
    queryKey: [
      'engagement',
      'management',
      session?.id,
      'payment-summary',
      from,
      to,
      today,
    ],
    queryFn: async ({ signal }) =>
      (
        await apiRequest<PaymentSummary>(
          'management',
          `/commerce/payment-summary?${new URLSearchParams({ from, to })}`,
          { signal }
        )
      ).data,
    enabled: session?.audience === 'management',
    retry: false,
    staleTime: 30000,
  })
  useErrorToast(query.error?.message, 'payment-summary')
  return query
}
