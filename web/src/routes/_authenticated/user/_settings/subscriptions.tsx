import { createFileRoute } from '@tanstack/react-router'
import { UserSubscriptions } from '@/features/user-subscriptions'

export const Route = createFileRoute(
  '/_authenticated/user/_settings/subscriptions'
)({ component: UserSubscriptions })
