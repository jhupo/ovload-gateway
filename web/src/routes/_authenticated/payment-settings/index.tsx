import { createFileRoute } from '@tanstack/react-router'
import { PaymentSettings } from '@/features/payment-settings'

export const Route = createFileRoute('/_authenticated/payment-settings/')({
  component: PaymentSettings,
})
