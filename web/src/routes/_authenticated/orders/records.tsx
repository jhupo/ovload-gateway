import { createFileRoute } from '@tanstack/react-router'
import { OrderRecords } from '@/features/orders/records'

export const Route = createFileRoute('/_authenticated/orders/records')({
  component: OrderRecords,
})
