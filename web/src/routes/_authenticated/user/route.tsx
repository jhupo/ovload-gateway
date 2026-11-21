import { createFileRoute } from '@tanstack/react-router'
import { UserLayout } from '@/components/layout/user-layout'

export const Route = createFileRoute('/_authenticated/user')({
  component: UserLayout,
})
