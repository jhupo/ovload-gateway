import { createFileRoute, notFound } from '@tanstack/react-router'
import { Settings } from '@/features/settings'

export const Route = createFileRoute('/_authenticated/settings')({
  beforeLoad: ({ location }) => {
    if (location.pathname !== '/settings' && location.pathname !== '/settings/')
      throw notFound({ routeId: '__root__' })
  },
  component: Settings,
})
