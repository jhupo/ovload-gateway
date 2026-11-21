import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Users } from '@/features/users'
import { roleValues, statusValues } from '@/features/users/data/schema'

const usersSearchSchema = z.object({
  page: z.number().int().positive().optional().catch(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)]).optional().catch(10),
  role: z.array(z.enum(roleValues)).optional().catch([]),
  status: z.array(z.enum(statusValues)).optional().catch([]),
  query: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  component: Users,
})
