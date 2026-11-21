import { createFileRoute, redirect } from '@tanstack/react-router'
import { ApiError } from '@/api/errors'
import { useIdentitySession } from '@/stores/identity-session'
import {
  canOpenManagementPath,
  managementHomePath,
} from '@/lib/route-authority'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const audience =
      location.pathname.startsWith('/user/') || location.pathname === '/user'
        ? 'customer'
        : 'management'
    const active = useIdentitySession.getState().session
    if (active && active.audience !== audience) {
      throw redirect({
        to:
          active.audience === 'customer'
            ? '/user/dashboard'
            : managementHomePath(),
        replace: true,
      })
    }
    try {
      await useIdentitySession.getState().restore(audience)
      if (
        audience === 'management' &&
        !canOpenManagementPath(location.pathname.replace(/\/$/, ''))
      )
        throw new ApiError(403, 'identity.forbidden', 'Permission denied')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw redirect({ to: '/sign-in', replace: true })
      throw error
    }
  },
  component: AuthenticatedLayout,
})
