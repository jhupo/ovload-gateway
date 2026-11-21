import { createFileRoute } from '@tanstack/react-router'
import { UserOrders } from '@/features/user-orders'

export const Route = createFileRoute('/_authenticated/user/_settings/orders')({
  component: UserOrders,
})
