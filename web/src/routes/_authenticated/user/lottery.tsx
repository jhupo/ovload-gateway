import { createFileRoute } from '@tanstack/react-router'
import { Lottery } from '@/features/lottery'

export const Route = createFileRoute('/_authenticated/user/lottery')({
  component: Lottery,
})
