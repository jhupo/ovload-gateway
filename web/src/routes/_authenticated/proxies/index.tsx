import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Proxies } from '@/features/proxies'

export const Route = createFileRoute('/_authenticated/proxies/')({
  validateSearch: z.object({
    query: z.string().max(200).catch(''),
  }),
  component: Proxies,
})
