import { createFileRoute } from '@tanstack/react-router'
import { DataBackup } from '@/features/data-backup'

export const Route = createFileRoute('/_authenticated/data-backup')({
  component: DataBackup,
})
