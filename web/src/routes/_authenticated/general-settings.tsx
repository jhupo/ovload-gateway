import { createFileRoute } from '@tanstack/react-router'
import { GeneralSettings } from '@/features/general-settings'

export const Route = createFileRoute('/_authenticated/general-settings')({
  component: GeneralSettings,
})
