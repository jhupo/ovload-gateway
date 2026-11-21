import { createFileRoute } from '@tanstack/react-router'
import { PaymentOverview } from '@/features/orders/overview'

export const Route = createFileRoute('/_authenticated/orders/overview')({
  component: PaymentOverview,
})
