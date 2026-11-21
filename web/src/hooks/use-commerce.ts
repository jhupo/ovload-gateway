import { useRef } from 'react'
import type {
  Order,
  Plan,
  Redemption,
  RedemptionCode,
  Subscription,
} from '@/api/contracts/commerce'
import { useEngagement } from './use-engagement'

export type CommerceUser = {
  id: string
  username: string
  email: string
  status: string
}
export type Redeemed = {
  id: string
  code: string
  type: RedemptionCode['type']
  value: number
  planName: string
  at: string
}
export type Commerce = {
  history?: Redemption[]
  plans: Plan[]
  records: Subscription[]
  users: CommerceUser[]
  codes: RedemptionCode[]
  orders: Order[]
  redemptions: Redeemed[]
}
const empty: Commerce = {
  plans: [],
  records: [],
  users: [],
  codes: [],
  orders: [],
  redemptions: [],
}

export function planDocument(plan: Plan) {
  const {
    id: _id,
    revision: _revision,
    subscriberCount: _subscribers,
    ...document
  } = plan
  return document
}
export function useCommerce(scope = 'none') {
  const pendingKeys = useRef(new Map<string, string>())
  const { data, execute, busy, refresh, isPending, isError, error } =
    useEngagement<Commerce>(`commerce-${scope}`, scope !== 'none')
  return {
    ...(data ?? empty),
    isPending,
    isError,
    error,
    ready: scope === 'none' || !!data,
    busy: busy || (scope !== 'none' && !data),
    refresh,
    execute: async (command: Record<string, unknown>) => {
      const signature = JSON.stringify(command)
      const key = pendingKeys.current.get(signature) ?? crypto.randomUUID()
      pendingKeys.current.set(signature, key)
      const result = await execute({ op: 'commerce', key, command })
      pendingKeys.current.delete(signature)
      return result
    },
  }
}
