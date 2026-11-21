import { createFileRoute } from '@tanstack/react-router'
import { SubscriptionPlans } from '@/features/subscriptions'

export const Route = createFileRoute('/_authenticated/orders/plans')({
  component: SubscriptionPlans,
})
