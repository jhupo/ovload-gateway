import { createFileRoute } from '@tanstack/react-router'
import { FeatureSettings } from '@/features/feature-settings'

export const Route = createFileRoute('/_authenticated/feature-settings')({
  component: FeatureSettings,
})
