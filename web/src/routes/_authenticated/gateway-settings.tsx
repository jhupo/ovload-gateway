import { createFileRoute } from '@tanstack/react-router'
import { GatewaySettings } from '@/features/gateway-settings'

export const Route = createFileRoute('/_authenticated/gateway-settings')({
  component: GatewaySettings,
})
