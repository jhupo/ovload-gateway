import { createFileRoute } from '@tanstack/react-router'
import { ChannelMonitoring } from '@/features/channels/monitoring'

export const Route = createFileRoute('/_authenticated/channels/monitoring')({
  component: ChannelMonitoring,
})
