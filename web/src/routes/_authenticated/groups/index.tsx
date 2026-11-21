import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Groups } from '@/features/groups'
import {
  statusValues,
  platformValues,
  visibilityValues,
} from '@/features/groups/data/schema'

export const Route = createFileRoute('/_authenticated/groups/')({
  validateSearch: z.object({
    page: z.number().int().positive().optional().catch(1),
    pageSize: z
      .union([
        z.literal(10),
        z.literal(20),
        z.literal(30),
        z.literal(40),
        z.literal(50),
      ])
      .optional()
      .catch(10),
    platform: z.array(z.enum(platformValues)).optional().catch([]),
    visibility: z.array(z.enum(visibilityValues)).optional().catch([]),
    status: z.array(z.enum(statusValues)).optional().catch([]),
    query: z.string().optional().catch(''),
  }),
  component: Groups,
})
