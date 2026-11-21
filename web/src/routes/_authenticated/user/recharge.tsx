import { createFileRoute } from '@tanstack/react-router'
import { UserRecharge } from '@/features/user-recharge'

export const Route = createFileRoute('/_authenticated/user/recharge')({
  component: UserRecharge,
})
