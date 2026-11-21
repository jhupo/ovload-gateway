import { listAccountGroups } from '@/api/account-groups'
import { modelKeys } from '@/api/model-keys'
import type { Audience } from '@/api/types'
import { aggregatePlatformCounts } from '@/lib/upstream-platforms'

export const statusWindows = ['90m', '24h', '7d', '30d'] as const
export type StatusWindow = (typeof statusWindows)[number]
export const statusIntervals: Record<StatusWindow, number> = {
  '90m': 18,
  '24h': 24,
  '7d': 28,
  '30d': 60,
}

export type StatusGroup = {
  id: string
  name: string
  enabled: boolean
  providers: string[]
}

export async function loadStatusGroups(
  audience: Audience,
  signal: AbortSignal
): Promise<StatusGroup[]> {
  if (audience === 'customer')
    return (await modelKeys.groups(signal)).map((group) => ({
      ...group,
      enabled: true,
      providers: [],
    }))

  const groups = new Map<string, StatusGroup>()
  let page = 1
  let totalPages: number
  do {
    const result = await listAccountGroups(
      { page, pageSize: 200, sort: 'name', descending: false },
      signal
    )
    for (const group of result.items)
      groups.set(group.id, {
        id: group.id,
        name: group.name,
        enabled: group.enabled,
        providers: Object.entries(aggregatePlatformCounts(group.providerCounts))
          .filter(([, count]) => count > 0)
          .map(([provider]) => provider),
      })
    totalPages = result.page.totalPages
    page++
  } while (page <= totalPages)
  return [...groups.values()]
}

export function groupStatusSections(groups: StatusGroup[]) {
  const sections = new Map<string, StatusGroup[]>()
  for (const group of groups) {
    const provider =
      group.providers.length === 1
        ? group.providers[0]
        : group.providers.length > 1
          ? 'mixed'
          : 'unassigned'
    const rows = sections.get(provider) ?? []
    rows.push(group)
    sections.set(provider, rows)
  }
  return [...sections].map(([provider, rows]) => ({ provider, rows }))
}
