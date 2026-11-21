import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  OnChangeFn,
  PaginationState,
  SortingState,
} from '@tanstack/react-table'
import i18n from '@/i18n'
import { apiRequest } from '@/api/client'
import { useIdentitySession } from '@/stores/identity-session'
import type { ServerTableState } from '@/components/data-table/server-state'
import { useCommerce, type Commerce } from './use-commerce'
import { useErrorToast } from './use-error-toast'

export function useCommercePage(
  scope: string,
  filters: Record<string, string> = {},
  pageSize = 50
) {
  const session = useIdentitySession((s) => s.session)
  const mutation = useCommerce()
  const key = JSON.stringify(filters)
  const [page, setPage] = useState({ key, pageIndex: 0, pageSize })
  const [sorting, setSorting] = useState<SortingState>(
    scope === 'plans' ? [{ id: 'sort', desc: false }] : []
  )
  const pagination = {
    pageIndex: page.key === key ? page.pageIndex : 0,
    pageSize: page.pageSize,
  }
  const onPaginationChange: OnChangeFn<PaginationState> = (change) => {
    const next = typeof change === 'function' ? change(pagination) : change
    setPage({ key, ...next })
  }
  const onSortingChange: OnChangeFn<SortingState> = (change) => {
    setSorting(typeof change === 'function' ? change(sorting) : change)
    setPage({ key, pageIndex: 0, pageSize: pagination.pageSize })
  }
  const params = new URLSearchParams({
    ...filters,
    page: String(pagination.pageIndex + 1),
    size: String(pagination.pageSize),
  })
  if (sorting[0]) {
    params.set('sort', sorting[0].id)
    params.set('desc', String(sorting[0].desc))
  }
  const audience = session?.audience ?? 'customer'
  const query = useQuery({
    queryKey: [
      'engagement',
      audience,
      session?.id,
      'page',
      scope,
      params.toString(),
    ],
    queryFn: async ({ signal }) =>
      (
        await apiRequest<Commerce & { total: number }>(
          audience,
          `/commerce/${scope}?${params}`,
          { signal }
        )
      ).data,
    enabled: !!session,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === session?.id ? previous : undefined,
    retry: false,
    refetchInterval:
      scope === 'subscriptions' || scope === 'records' ? 30000 : false,
  })
  const total = query.data?.total
  const lastPage =
    total === undefined
      ? undefined
      : Math.max(0, Math.ceil(total / pagination.pageSize) - 1)
  if (
    !query.isPlaceholderData &&
    lastPage !== undefined &&
    page.key === key &&
    page.pageIndex > lastPage
  ) {
    setPage({ ...page, pageIndex: lastPage })
  }
  useErrorToast(query.error?.message, `commerce-page-${scope}`)
  return {
    ...mutation,
    ...query.data,
    ready: !!query.data && !(query.isError && query.isPlaceholderData),
    error: query.error,
    refresh: query.refetch,
    busy: mutation.busy || query.isFetching,
    tableState: {
      pagination,
      sorting,
      onPaginationChange,
      onSortingChange,
      total: query.data?.total ?? 0,
    } satisfies ServerTableState,
    async exportAll() {
      const result: Commerce = {
        plans: [],
        records: [],
        users: [],
        codes: [],
        orders: [],
        redemptions: [],
      }
      for (let page = 1; ; page++) {
        const next = new URLSearchParams(params)
        next.set('page', String(page))
        next.set('size', '200')
        const data = (
          await apiRequest<Commerce & { total: number }>(
            audience,
            `/commerce/${scope}?${next}`
          )
        ).data
        if (useIdentitySession.getState().session?.id !== session?.id)
          throw new Error('Session changed')
        if (data.total > 10000) throw new Error(i18n.t('usage.exportTooLarge'))
        for (const name of Object.keys(result) as (keyof Commerce)[])
          (result[name] as unknown[]).push(...(data[name] ?? []))
        if (page * 200 >= data.total) return result
      }
    },
  }
}
