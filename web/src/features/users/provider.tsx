import { useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '@/i18n'
import { ApiError } from '@/api/errors'
import { customersApi } from '@/api/customers'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { UsersContext } from './context'

export function UsersProvider({
  owner,
  children,
}: {
  owner: string | undefined
  children: ReactNode
}) {
  const queries = useQueryClient()
  const [pending, setPending] = useState(false)
  const locked = useRef(false)
  useIdentitySession((state) => state.grants)
  const currentOwner = () =>
    !!owner && useIdentitySession.getState().session?.id === owner
  const canManage = (tenantId?: string) =>
    currentOwner() && allows('identity.users.manage', tenantId)
  async function write(
    tenantId: string | undefined,
    operation: () => Promise<unknown>
  ) {
    if (!canManage(tenantId))
      throw new ApiError(
        403,
        'identity.forbidden',
        i18n.t('identity.errors.forbidden')
      )
    if (locked.current)
      throw new ApiError(
        409,
        'identity.conflict',
        i18n.t('identity.errors.conflict')
      )
    locked.current = true
    setPending(true)
    try {
      await operation()
      if (!currentOwner())
        throw new ApiError(
          401,
          'identity.unauthorized',
          i18n.t('identity.errors.unauthorized')
        )
      await queries.invalidateQueries({ queryKey: ['customers', owner] })
    } finally {
      locked.current = false
      if (currentOwner()) setPending(false)
    }
  }
  return (
    <UsersContext.Provider
      value={{
        owner,
        pending,
        canManage,
        create: (input) => write(undefined, () => customersApi.create(input)),
        update: (row, revision, input) =>
          write(row.tenant_id, () => customersApi.update(row, revision, input)),
        setActive: (row, revision, active) =>
          write(row.tenant_id, () =>
            customersApi.setActive(row, revision, active)
          ),
      }}
    >
      {children}
    </UsersContext.Provider>
  )
}
