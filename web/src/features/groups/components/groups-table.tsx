import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type ColumnFiltersState,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import type { AccountGroup } from '@/api/account-groups'
import { accountProviderLabel } from '@/lib/upstream-platforms'
import { cn } from '@/lib/utils'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DataTableFrame,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { platformValues, visibilityValues, statusValues } from '../data/schema'
import { type GroupActionsOptions } from './group-actions'
import { useGroupsColumns } from './groups-columns'

export function GroupsTable({
  data,
  total,
  loading,
  loaded,
  error,
  search,
  navigate,
  sorting,
  onSortingChange,
  ...actions
}: GroupActionsOptions & {
  data: AccountGroup[]
  total: number
  loading: boolean
  loaded: boolean
  error?: string
  search: Record<string, unknown>
  navigate: NavigateFn
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
}) {
  const { t } = useTranslation()
  const columns = useGroupsColumns(actions)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: 10 },
      globalFilter: { enabled: false },
    })
  const columnFilters = useMemo<ColumnFiltersState>(
    () => [
      ...(typeof search.query === 'string' && search.query
        ? [{ id: 'name', value: search.query }]
        : []),
      ...(['platform', 'visibility'] as const).flatMap((id) =>
        Array.isArray(search[id]) && search[id].length
          ? [{ id, value: search[id] }]
          : []
      ),
      ...(Array.isArray(search.status) && search.status.length
        ? [{ id: 'status', value: search.status }]
        : []),
    ],
    [search]
  )
  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next =
      typeof updater === 'function' ? updater(columnFilters) : updater
    navigate({
      search: (previous) => ({
        ...previous,
        page: undefined,
        query: next.find((filter) => filter.id === 'name')?.value || undefined,
        platform: next.find((filter) => filter.id === 'platform')?.value,
        visibility: next.find((filter) => filter.id === 'visibility')?.value,
        status: next.find((filter) => filter.id === 'status')?.value,
      }),
    })
  }
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    rowCount: total,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    enableMultiSort: false,
    state: { pagination, columnFilters, sorting, columnVisibility },
    onPaginationChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      onSortingChange(updater)
      onPaginationChange({ ...pagination, pageIndex: 0 })
    },
    getCoreRowModel: getCoreRowModel(),
  })
  useEffect(() => {
    if (loaded) ensurePageInRange(Math.max(1, table.getPageCount()))
  }, [loaded, table, ensurePageInRange])
  useEffect(() => {
    const scroller = viewportRef.current
    if (scroller) scroller.scrollTop = 0
  }, [pagination.pageIndex, pagination.pageSize, columnFilters, sorting])
  const empty =
    error ?? (loading ? t('channelGroups.loading') : t('data_table.no_results'))
  return (
    <DataTableFrame
      data={data}
      columns={columns}
      label={t('groups.title')}
      loading={loading}
      error={error}
      empty={empty}
      viewportRef={viewportRef}
      viewportClassName='@container'
      pagination={
        loaded ? (
          <DataTablePagination table={table} className='shrink-0' />
        ) : null
      }
      className='@container'
      testId='groups-directory'
      toolbar={
        <DataTableToolbar
          table={table}
          searchPlaceholder={t('groups.search')}
          searchKey='name'
          filters={[
            {
              columnId: 'platform',
              title: t('groups.platform'),
              options: platformValues.map((value) => ({
                value,
                label:
                  value === 'all'
                    ? t('groups.all_platforms')
                    : accountProviderLabel(value),
              })),
            },
            {
              columnId: 'visibility',
              title: t('groups.type'),
              options: visibilityValues.map((value) => ({
                value,
                label: t(`groups.${value}`),
              })),
            },
            {
              columnId: 'status',
              title: t('groups.status'),
              options: statusValues.map((value) => ({
                value,
                label: t(`groups.${value}`),
              })),
            },
          ]}
        />
      }
    >
      <Table
        aria-label={t('groups.title')}
        className='min-w-[1080px] border-separate border-spacing-0'
      >
        <TableHeader className='sticky top-0 z-10 bg-background'>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className='group/row'>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  className={cn(
                    'bg-background group-hover/row:bg-muted',
                    header.column.columnDef.meta?.className,
                    header.column.columnDef.meta?.thClassName
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-testid='group-row'
              className='group/row border-border/60 transition-[background-color] hover:bg-muted/25'
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    'bg-card py-2.5 group-hover/row:bg-muted/25',
                    cell.column.columnDef.meta?.className,
                    cell.column.columnDef.meta?.tdClassName
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableFrame>
  )
}
