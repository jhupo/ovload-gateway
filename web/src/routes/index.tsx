import { createFileRoute, redirect } from '@tanstack/react-router'
import { redirectSignedIn } from '@/lib/sign-in-session'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await redirectSignedIn()
    throw redirect({ to: '/sign-in', replace: true })
  },
})
