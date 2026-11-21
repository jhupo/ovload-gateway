import { type QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from '@/components/ui/sonner'
import { NavigationProgress } from '@/components/navigation-progress'
import { DatabaseRestoreProgress } from '@/features/data-backup/restore-progress'
import { pendingDatabaseRestore } from '@/features/data-backup/restore-state'
import { GeneralError } from '@/features/errors/general-error'
import { NotFoundError } from '@/features/errors/not-found-error'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: () => {
    const restore = pendingDatabaseRestore()
    if (restore) return <DatabaseRestoreProgress job={restore} />
    return (
      <>
        <NavigationProgress />
        <Outlet />
        <Toaster duration={5000} position='bottom-right' richColors />
        {import.meta.env.VITE_DEVTOOLS === 'true' && (
          <>
            <ReactQueryDevtools buttonPosition='bottom-left' />
            <TanStackRouterDevtools position='bottom-right' />
          </>
        )}
      </>
    )
  },
  notFoundComponent: NotFoundError,
  errorComponent: GeneralError,
})
