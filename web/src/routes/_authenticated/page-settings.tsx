import { createFileRoute } from '@tanstack/react-router'
import { PageSettings } from '@/features/page-settings'

export const Route = createFileRoute('/_authenticated/page-settings')({
  component: PageSettings,
})
