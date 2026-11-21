import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/user/')({
  beforeLoad: () => {
    throw redirect({ to: '/user/dashboard', replace: true })
  },
})
