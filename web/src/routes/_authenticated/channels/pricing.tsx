import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/channels/pricing')({
  beforeLoad: () => {
    throw redirect({ to: '/gateway-settings' })
  },
})
