import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Subscriptions } from '@/features/subscriptions'

export const Route = createFileRoute('/_authenticated/subscriptions/')({
  validateSearch: z.object({
    query: z.string().max(200).catch(''),
    status: z
      .enum([
        'all',
        'active',
        'scheduled',
        'expired',
        'revoked',
        'published',
        'unpublished',
      ])
      .catch('all'),
    plan: z.string().max(100).catch('all'),
  }),
  component: Subscriptions,
})
