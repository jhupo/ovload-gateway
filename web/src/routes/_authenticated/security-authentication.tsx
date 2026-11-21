import { createFileRoute } from '@tanstack/react-router'
import { SecurityAuthentication } from '@/features/security-authentication'

export const Route = createFileRoute('/_authenticated/security-authentication')(
  {
    component: SecurityAuthentication,
  }
)
