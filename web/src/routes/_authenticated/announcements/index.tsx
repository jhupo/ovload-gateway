import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Announcements } from '@/features/announcements'

export const Route = createFileRoute('/_authenticated/announcements/')({
  validateSearch: z.object({
    query: z.string().max(200).catch(''),
    status: z
      .enum(['all', 'draft', 'published', 'scheduled', 'archived'])
      .catch('all'),
    delivery: z.enum(['all', 'silent', 'popup']).catch('all'),
  }),
  component: Announcements,
})
