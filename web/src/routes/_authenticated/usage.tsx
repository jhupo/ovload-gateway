import { createFileRoute } from '@tanstack/react-router'
import { UsageStatistics } from '@/features/usage'

export const Route = createFileRoute('/_authenticated/usage')({
  component: UsageStatistics,
})
