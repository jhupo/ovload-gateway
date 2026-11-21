import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { useIdentitySession } from '@/stores/identity-session'
import type { LotteryRound, LotteryWinner, LedgerRow } from '@/api/contracts/engagement'
import type {
  InvitationRecord,
  RebateRecord,
  TransferRecord,
} from '@/api/contracts/engagement'
import { useErrorToast } from './use-error-toast'

export type LotteryState = {
  current: {
    id: number
    rewardCents: number
    winnerCount: number
    participantTarget: number
    minimumRechargeCents: number
    humanVerification: boolean
    participants: number
    joined: boolean
  } | null
  winners: (LotteryWinner & {
    round: number
    username: string
    email: string
    drawnAt: string
  })[]
  personalWinnings: Pick<LotteryRound, 'id' | 'rewardCents' | 'drawnAt'>[]
  rounds: LotteryRound[]
}
export type ReferralState = {
  enabled: boolean
  rate: string
  freezeHours: string
  summary: {
    code: string
    available: string
    frozen: string
    total: string
    invited: number
    rewarded: number
  }
  invitations: (LedgerRow &
    Omit<InvitationRecord, 'invitee'> & { inviteeName: string })[]
  rebates: (LedgerRow &
    Omit<RebateRecord, 'invitee'> & {
      inviteeName: string
      rate: string
      status: 'frozen' | 'released'
    })[]
  withdrawals: (LedgerRow & TransferRecord)[]
}
export function useEngagement<T>(view: string, enabled = true) {
  const session = useIdentitySession((s) => s.session)
  const audience = session?.audience ?? 'customer'
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['engagement', audience, session?.id, view],
    queryFn: async ({ signal }) =>
      (
        await apiRequest<T>(
          audience,
          `/engagement/${encodeURIComponent(view)}`,
          { signal }
        )
      ).data,
    enabled: !!session && enabled,
    refetchInterval: /^commerce-(records|subscriptions)/.test(view)
      ? 30000
      : view.startsWith('commerce-')
        ? false
        : 15000,
    staleTime: view.startsWith('commerce-') ? 30000 : 0,
    retry: false,
  })
  useErrorToast(query.error?.message, `engagement-${view}`)
  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (
        await apiRequest<unknown>(audience, '/engagement', {
          method: 'POST',
          body,
        })
      ).data,
    onSuccess: async () => {
      if (useIdentitySession.getState().session?.id !== session?.id) return
      await Promise.all([
        client.invalidateQueries({ queryKey: ['engagement'] }),
        client.invalidateQueries({ queryKey: ['management-wallet'] }),
        client.invalidateQueries({ queryKey: ['wallet'] }),
        client.invalidateQueries({ queryKey: ['customer-wallet'] }),
      ])
    },
    onError: (e) => toast.error(e.message),
  })
  return {
    data: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refresh: query.refetch,
    execute: mutation.mutateAsync,
    busy: mutation.isPending,
  }
}
