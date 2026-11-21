import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { accountPlatform, isAccountPlatform } from '@/lib/upstream-platforms'
import { Accounts } from '@/features/accounts'

export const Route = createFileRoute('/_authenticated/accounts/')({
  validateSearch: z.object({
    query: z.string().max(200).catch(''),
    provider: z
      .string()
      .catch('all')
      .transform((value) => {
        const platform = accountPlatform(value)
        return isAccountPlatform(platform) ? platform : ('all' as const)
      }),
    status: z
      .enum([
        'all',
        'normal',
        'quota_exhausted',
        'rate_limited',
        'disabled',
        'error',
      ])
      .catch('all'),
    group: z.string().max(80).catch('all'),
  }),
  component: Accounts,
})
