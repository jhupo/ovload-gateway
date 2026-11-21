import { createFileRoute } from '@tanstack/react-router'
import { MailSettings } from '@/features/mail-settings'

export const Route = createFileRoute('/_authenticated/mail-settings')({
  component: MailSettings,
})
