import { createFileRoute } from '@tanstack/react-router'
import { UserUsage } from '@/features/user-usage'

export const Route = createFileRoute('/_authenticated/user/usage')({
  component: UserUsage,
})
