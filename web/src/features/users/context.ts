import { createContext, useContext } from 'react'
import type { customersApi } from '@/api/customers'

type UsersActions = {
  owner: string | undefined
  pending: boolean
  canManage: (tenantId?: string) => boolean
  create: (input: Parameters<typeof customersApi.create>[0]) => Promise<void>
  update: (...input: Parameters<typeof customersApi.update>) => Promise<void>
  setActive: (
    ...input: Parameters<typeof customersApi.setActive>
  ) => Promise<void>
}

export const UsersContext = createContext<UsersActions | null>(null)

export function useUsersActions() {
  const value = useContext(UsersContext)
  if (!value) throw new Error('Users components require UsersProvider')
  return value
}
