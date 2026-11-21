import { createFileRoute } from '@tanstack/react-router'
import { ReferralPage } from '@/features/referrals'

export const Route = createFileRoute('/_authenticated/referrals/invitations')({
  component: () => <ReferralPage kind='invitations' />,
})
