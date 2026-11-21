import { createFileRoute } from '@tanstack/react-router'
import { UserReferrals } from '@/features/user-referrals'

export const Route = createFileRoute(
  '/_authenticated/user/_settings/referrals'
)({
  component: UserReferrals,
})
