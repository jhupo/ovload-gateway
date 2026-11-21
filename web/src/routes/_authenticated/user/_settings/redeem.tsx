import { createFileRoute } from '@tanstack/react-router'
import { UserRedeem } from '@/features/user-redeem'

export const Route = createFileRoute('/_authenticated/user/_settings/redeem')({
  component: UserRedeem,
})
