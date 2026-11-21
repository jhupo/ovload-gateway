import { createFileRoute } from '@tanstack/react-router'
import { UserDashboard } from '@/features/user-dashboard'

export const Route = createFileRoute('/_authenticated/user/dashboard')({
  component: UserDashboard,
})
