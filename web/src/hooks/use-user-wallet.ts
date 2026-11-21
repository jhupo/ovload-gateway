import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import i18n from '@/i18n'
import { ApiError } from '@/api/errors'
import {
  creditManagementWallet,
  getManagementWallet,
  listManagementWalletCredits,
  requireWalletOwner,
  validateWalletCredit,
  type WalletCreditInput,
  type WalletCreditReceipt,
} from '@/api/management-wallet'
import { allows, useIdentitySession } from '@/stores/identity-session'

const walletKey = (ownerId: string | undefined, tenantId: string | undefined) =>
  ['management-wallet', ownerId, tenantId] as const

function forbidden(ownerId: string) {
  return new ApiError(
    403,
    'identity.forbidden',
    i18n.t('identity.errors.forbidden'),
    undefined,
    ownerId
  )
}

export function useUserWallet(tenantId: string | undefined, enabled = true) {
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const ownerId = session?.audience === 'management' ? session.id : undefined
  const canRead = !!ownerId && !!tenantId && allows('billing.read', tenantId)
  const query = useQuery({
    queryKey: walletKey(ownerId, tenantId),
    queryFn: ({ signal }) => {
      requireWalletOwner(ownerId)
      if (!ownerId || !tenantId || !allows('billing.read', tenantId))
        throw forbidden(ownerId ?? '')
      return getManagementWallet(ownerId, tenantId, signal)
    },
    enabled: enabled && canRead,
    retry: false,
  })
  return {
    data: canRead ? query.data : undefined,
    canRead,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useUserWalletCredits(
  tenantId: string | undefined,
  enabled = true
) {
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const ownerId = session?.audience === 'management' ? session.id : undefined
  const canRead = !!ownerId && !!tenantId && allows('billing.read', tenantId)
  const query = useInfiniteQuery({
    queryKey: ['management-wallet-credits', ownerId, tenantId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      requireWalletOwner(ownerId)
      if (!ownerId || !tenantId || !allows('billing.read', tenantId))
        throw forbidden(ownerId ?? '')
      return listManagementWalletCredits(ownerId, tenantId, pageParam, signal)
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    getPreviousPageParam: () => undefined,
    maxPages: 10,
    enabled: enabled && canRead,
    retry: false,
  })
  return {
    data: canRead ? query.data : undefined,
    canRead,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  }
}

type CreditIntent = {
  ownerId: string
  tenantId: string
  input: WalletCreditInput
  amount: bigint
  key: string
  hasUncertainOutcome: boolean
  controller?: AbortController
  inFlight?: Promise<WalletCreditReceipt>
}

const pendingCredits = new Map<string, CreditIntent>()
const pendingCreditListeners = new Set<() => void>()
let pendingCreditRevision = 0

function publishPendingCredits() {
  pendingCreditRevision++
  for (const listener of pendingCreditListeners) listener()
}

function subscribePendingCredits(listener: () => void) {
  pendingCreditListeners.add(listener)
  return () => pendingCreditListeners.delete(listener)
}

function pendingCreditSnapshot() {
  return pendingCreditRevision
}

useIdentitySession.subscribe((state, previous) => {
  if (state.session?.id === previous.session?.id) return
  for (const [key, intent] of pendingCredits) {
    if (intent.ownerId !== state.session?.id) {
      intent.controller?.abort()
      pendingCredits.delete(key)
    }
  }
  publishPendingCredits()
})

export function useCreditUserWallet(tenantId: string | undefined) {
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const ownerId = session?.audience === 'management' ? session.id : undefined
  useSyncExternalStore(
    subscribePendingCredits,
    pendingCreditSnapshot,
    pendingCreditSnapshot
  )
  const controllers = useRef(new Set<AbortController>())
  const queryClient = useQueryClient()
  useEffect(() => {
    const active = controllers.current
    return () => {
      for (const controller of active) controller.abort()
      active.clear()
    }
  }, [ownerId, tenantId])
  const mutation = useMutation({
    mutationKey: ['management-wallet-credit', ownerId, tenantId],
    mutationFn: async (intent: CreditIntent) => {
      requireWalletOwner(intent.ownerId)
      if (!allows('billing.manage', intent.tenantId)) {
        if (!intent.hasUncertainOutcome) {
          pendingCredits.delete(`${intent.ownerId}:${intent.tenantId}`)
          publishPendingCredits()
        }
        throw forbidden(intent.ownerId)
      }
      if (intent.inFlight) return intent.inFlight
      const controller = new AbortController()
      intent.controller = controller
      controllers.current.add(controller)
      const promise = creditManagementWallet(
        intent.ownerId,
        intent.tenantId,
        intent.input,
        intent.key,
        controller.signal
      )
      intent.inFlight = promise
      publishPendingCredits()
      try {
        const receipt = await promise
        pendingCredits.delete(`${intent.ownerId}:${intent.tenantId}`)
        publishPendingCredits()
        return receipt
      } catch (error) {
        const rejected =
          error instanceof ApiError && [400, 403, 404].includes(error.status)
        if (rejected && !intent.hasUncertainOutcome)
          pendingCredits.delete(`${intent.ownerId}:${intent.tenantId}`)
        else intent.hasUncertainOutcome = true
        publishPendingCredits()
        throw error
      } finally {
        controllers.current.delete(controller)
        intent.controller = undefined
        intent.inFlight = undefined
        publishPendingCredits()
      }
    },
    onSuccess: (_receipt, intent) => {
      if (useIdentitySession.getState().session?.id !== intent.ownerId) return
      void queryClient.invalidateQueries({
        queryKey: walletKey(intent.ownerId, intent.tenantId),
      })
      void queryClient.invalidateQueries({
        queryKey: [
          'management-wallet-credits',
          intent.ownerId,
          intent.tenantId,
        ],
      })
      void queryClient.invalidateQueries({
        queryKey: ['customers', intent.ownerId],
      })
    },
    retry: false,
  })
  const current =
    ownerId && tenantId
      ? pendingCredits.get(`${ownerId}:${tenantId}`)
      : undefined
  return {
    pendingInput: current?.input,
    awaitingConfirmation: !!current && !current.inFlight,
    isPending:
      !!current?.inFlight ||
      (mutation.isPending &&
        mutation.variables.ownerId === ownerId &&
        mutation.variables.tenantId === tenantId),
    submit: (input: WalletCreditInput) => {
      requireWalletOwner(ownerId)
      if (!ownerId || !tenantId || !allows('billing.manage', tenantId))
        return Promise.reject(forbidden(ownerId ?? ''))
      const amount = validateWalletCredit(input)
      const slot = `${ownerId}:${tenantId}`
      let intent = pendingCredits.get(slot)
      if (
        intent &&
        (intent.amount !== amount ||
          intent.input.reason !== input.reason ||
          intent.input.paidCny !== input.paidCny)
      )
        return Promise.reject(
          new ApiError(
            409,
            'billing.credit_retry_required',
            i18n.t('users.credit_retry_required')
          )
        )
      if (!intent) {
        if (pendingCredits.size >= 100)
          return Promise.reject(
            new ApiError(
              429,
              'billing.credit_pending_limit',
              i18n.t('users.credit_pending_limit')
            )
          )
        intent = {
          ownerId,
          tenantId,
          amount,
          input: { ...input },
          key: crypto.randomUUID(),
          hasUncertainOutcome: false,
        }
        pendingCredits.set(slot, intent)
        publishPendingCredits()
      }
      return mutation.mutateAsync(intent)
    },
  }
}
