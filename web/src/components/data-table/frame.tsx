import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanStackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DataTablePagination } from './pagination'
import type { ServerTableState, ServerFilters } from './server-state'
import { DataTableToolbar } from './toolbar'
import { DataTableToolbarLayout } from './toolbar-layout'
import { DataTableViewOptions } from './view-options'

type FacetedFilters<T> = ComponentProps<typeof DataTableToolbar<T>>['filters']

export type DataTableFrameProps<T extends { id: string }> = {
  data?: T[]
  columns?: ColumnDef<T>[]
  label?: string
  searchPlaceholder?: string
  searchText?: (record: T) => string
  facetedFilters?: FacetedFilters<T>
  toolbar?: ReactNode
  initialSorting?: SortingState
  initialVisibility?: VisibilityState
  pagination?: ReactNode
  server?: ServerTableState
  onFilterChange?: (value: ServerFilters) => void
  filterState?: ServerFilters
  mobile?: (row: T) => ReactNode
  preserveColumnWidths?: boolean
  children?: ReactNode | ((table: TanStackTable<T>) => ReactNode)
  loading?: boolean
  error?: ReactNode
  empty?: ReactNode
  viewportRef?: Ref<HTMLDivElement>
  viewportClassName?: string
  fixedColumnClassName?: (columnId: string) => string | undefined
  className?: string
  testId?: string
}

/**
 * The only table shell used by feature pages. It owns the vertical layout,
 * scroll viewport, toolbar/footer slots and the standard table rendering.
 * Feature code may provide children when it needs a custom table body (for
 * example fixed columns), while the frame still owns the surrounding layout.
 */
export function DataTableFrame<T extends { id: string }>({
  data = [],
  columns = [],
  label = 'Data table',
  searchPlaceholder,
  searchText = () => '',
  facetedFilters,
  toolbar,
  initialSorting = [],
  initialVisibility = {},
  pagination,
  server,
  onFilterChange,
  filterState,
  mobile,
  preserveColumnWidths = false,
  children,
  loading = false,
  error,
  empty,
  viewportRef,
  viewportClassName,
  fixedColumnClassName,
  className,
  testId,
}: DataTableFrameProps<T>) {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState(initialSorting)
  const [columnVisibility, setColumnVisibility] = useState(initialVisibility)
  const [localColumnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )
  const [localGlobalFilter, setGlobalFilter] = useState('')
  const columnFilters = filterState?.columns ?? localColumnFilters
  const globalFilter = filterState?.search ?? localGlobalFilter
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId: (record) => record.id,
    manualPagination: !!server || pagination !== undefined,
    manualSorting: !!server,
    manualFiltering: !!server,
    rowCount: server?.total,
    onPaginationChange: server?.onPaginationChange,
    state: {
      sorting: server?.sorting ?? sorting,
      columnVisibility,
      columnFilters,
      globalFilter,
      ...(server ? { pagination: server.pagination } : {}),
    },
    onSortingChange: server?.onSortingChange ?? setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: (change) => {
      const next = typeof change === 'function' ? change(columnFilters) : change
      setColumnFilters(next)
      onFilterChange?.({ search: globalFilter, columns: next })
    },
    onGlobalFilterChange: (change) => {
      const next = typeof change === 'function' ? change(globalFilter) : change
      setGlobalFilter(next)
      onFilterChange?.({ search: next, columns: columnFilters })
    },
    globalFilterFn: (row, _id, query: string) =>
      searchText(row.original)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const collectionScroll = useRef<HTMLDivElement>(null)
  const scrollRef = viewportRef ?? collectionScroll
  const { pageIndex, pageSize } = table.getState().pagination
  useEffect(() => {
    scrollRef &&
      'current' in scrollRef &&
      scrollRef.current?.scrollTo({ top: 0 })
  }, [pageIndex, pageSize, sorting, scrollRef])

  const renderBody = () => {
    if (children)
      return typeof children === 'function' ? children(table) : children
    if (mobile) {
      return (
        <>
          <div className='hidden lg:block [&>[data-slot=table-container]]:overflow-visible'>
            <Table
              aria-label={label}
              className='table-fixed'
              style={
                preserveColumnWidths
                  ? {
                      minWidth: table
                        .getVisibleLeafColumns()
                        .reduce((sum, column) => sum + column.getSize(), 0),
                    }
                  : undefined
              }
            >
              <TableHeader className='sticky top-0 z-10 bg-background'>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{
                          width: `${(header.getSize() / table.getVisibleLeafColumns().reduce((sum, column) => sum + column.getSize(), 0)) * 100}%`,
                        }}
                        className='h-11 px-4'
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
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className='px-4 py-3 whitespace-normal'
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='divide-y lg:hidden' role='list' aria-label={label}>
            {table.getRowModel().rows.map((row) => (
              <div key={row.id} role='listitem' className='p-4'>
                {mobile(row.original)}
              </div>
            ))}
          </div>
        </>
      )
    }
    return (
      <Table aria-label={label} className='min-w-[640px]'>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={fixedColumnClassName?.(header.column.id)}
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
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    'py-3 whitespace-nowrap',
                    fixedColumnClassName?.(cell.column.id)
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  const defaultToolbar =
    searchPlaceholder || facetedFilters ? (
      <DataTableToolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        filters={facetedFilters}
      />
    ) : null
  const resolvedToolbar = mobile ? (
    <DataTableToolbarLayout actions={<DataTableViewOptions table={table} />}>
      {toolbar ?? defaultToolbar}
    </DataTableToolbarLayout>
  ) : (
    toolbar ?? defaultToolbar
  )
  const hasRows = table.getRowModel().rows.length > 0
  const emptyState = empty ?? t('data_table.no_results')
  const stateBody = error ? (
    <div
      className='flex min-h-40 items-center justify-center text-sm text-destructive'
      role='alert'
    >
      {error}
    </div>
  ) : loading && !hasRows ? (
    <div
      className='flex min-h-40 items-center justify-center text-sm text-muted-foreground'
      role='status'
    >
      {t('data_table.loading')}
    </div>
  ) : !hasRows ? (
    <div className='flex min-h-40 items-center justify-center text-sm text-muted-foreground'>
      {emptyState}
    </div>
  ) : (
    renderBody()
  )

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-4', className)}
      data-testid={testId}
    >
      {resolvedToolbar}
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border [&>[data-slot=table-container]]:overflow-visible',
          viewportClassName
        )}
        aria-busy={loading}
      >
        {stateBody}
      </div>
      {pagination !== undefined ? (
        pagination
      ) : (
        <DataTablePagination table={table} className='shrink-0' />
      )}
    </div>
  )
}
