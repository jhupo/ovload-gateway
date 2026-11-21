import { createFileRoute } from '@tanstack/react-router'
import { redirectSignedIn } from '@/lib/sign-in-session'
import { SignIn } from '@/features/auth/sign-in'

export const Route = createFileRoute('/(auth)/sign-in')({
  beforeLoad: redirectSignedIn,
  component: SignIn,
})
