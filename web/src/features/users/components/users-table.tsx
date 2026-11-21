import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { customersApi, type CustomerDirectoryQuery } from '@/api/customers'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { RequestErrorToast } from '@/components/request-error-toast'
import { useUsersActions } from '../context'
import { type User, roleValues, statusValues } from '../data/schema'
import { UserMobileRow } from './user-mobile-row'
import { useUsersColumns } from './users-columns'

type UsersTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

const sortFields: Record<
  string,
  NonNullable<CustomerDirectoryQuery['sort']>
> = {
  id: 'id',
  username: 'display_name',
  balanceUsd: 'balance_usd',
  createdAt: 'created_at',
}

export function UsersTable({ search, navigate }: UsersTableProps) {
  const { t } = useTranslation()
  const { owner } = useUsersActions()
  const grants = useIdentitySession((state) => state.grants)
  const isMobile = useIsMobile()
  const readTenants = grants.flatMap((grant) =>
    grant.scope === 'tenant' &&
    grant.tenant_id &&
    allows('identity.users.read', grant.tenant_id)
      ? [grant.tenant_id]
      : []
  )
  const canRead =
    !!owner && (allows('identity.users.read') || readTenants.length > 0)
  const canSortBalance =
    allows('billing.read') ||
    (!allows('identity.users.read') &&
      readTenants.length > 0 &&
      readTenants.every((tenant) => allows('billing.read', tenant)))
  const columns = useUsersColumns(canSortBalance)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<SortingState>([])
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
        ? [{ id: 'username', value: search.query }]
        : []),
      ...(Array.isArray(search.role) && search.role.length
        ? [{ id: 'role', value: search.role }]
        : []),
      ...(Array.isArray(search.status) && search.status.length
        ? [{ id: 'status', value: search.status }]
        : []),
    ],
    [search.query, search.role, search.status]
  )
  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next =
      typeof updater === 'function' ? updater(columnFilters) : updater
    navigate({
      search: (previous) => ({
        ...previous,
        page: undefined,
        query:
          next.find((filter) => filter.id === 'username')?.value || undefined,
        role: next.find((filter) => filter.id === 'role')?.value,
        status: next.find((filter) => filter.id === 'status')?.value,
      }),
    })
  }
  const selectedSort = sorting[0]
  const input: CustomerDirectoryQuery = {
    page: pagination.pageIndex + 1,
    page_size: pagination.pageSize,
    query: typeof search.query === 'string' ? search.query : undefined,
    role: Array.isArray(search.role)
      ? (search.role as CustomerDirectoryQuery['role'])
      : undefined,
    status: Array.isArray(search.status)
      ? (search.status as CustomerDirectoryQuery['status'])
      : undefined,
    ...(selectedSort && (selectedSort.id !== 'balanceUsd' || canSortBalance)
      ? {
          sort: sortFields[selectedSort.id],
          order: selectedSort.desc ? 'desc' : 'asc',
        }
      : {}),
  }
  const query = useQuery({
    queryKey: ['customers', owner, grants, input],
    queryFn: ({ signal }) => customersApi.list(input, signal),
    enabled: canRead,
    retry: false,
  })
  const canPaginate = canRead && query.isSuccess && !query.isFetching
  const data = useMemo<User[]>(
    () =>
      canRead && grants.length
        ? (query.data?.items ?? []).map((source) => ({
            id: source.id,
            tenantId: source.tenant_id,
            record: source,
            username: source.display_name,
            email: source.email,
            role: source.role,
            status: source.status,
            concurrencyLimit: source.max_concurrency,
            rpmLimit: source.requests_per_minute,
            notes: source.notes,
            balanceUsd: allows('billing.read', source.tenant_id)
              ? source.balance_usd
              : null,
            createdAt: new Date(source.created_at),
            lastActiveAt: source.last_active_at
              ? new Date(source.last_active_at)
              : null,
            lastCalledAt: source.last_called_at
              ? new Date(source.last_called_at)
              : null,
          }))
        : [],
    [canRead, query.data, grants]
  )
  const emptyState = !canRead
    ? t('identity.permissionRequired')
    : query.isError
      ? null
      : query.isPending
        ? t('identity.loading')
        : t('data_table.no_results')
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId: (user) => user.id,
    state: { sorting, columnVisibility, columnFilters, pagination },
    onSortingChange: (updater) => {
      setSorting((previous) =>
        typeof updater === 'function' ? updater(previous) : updater
      )
      onPaginationChange({ ...pagination, pageIndex: 0 })
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange,
    onPaginationChange: (updater) => {
      if (canPaginate) onPaginationChange(updater)
    },
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    rowCount: query.data?.total ?? 0,
  })
  useEffect(() => {
    if (query.data) ensurePageInRange(Math.max(1, table.getPageCount()))
  }, [table, ensurePageInRange, query.data])
  useEffect(() => {
    const scroller = viewportRef.current?.querySelector(
      '[data-slot="table-container"], [data-users-mobile]'
    )
    if (scroller) scroller.scrollTop = 0
  }, [pagination.pageIndex, pagination.pageSize, columnFilters, sorting])
  return (
    <div
      className='flex min-h-0 min-w-0 flex-1 flex-col gap-4'
      data-testid='users-directory'
    >
      <DataTableToolbar
        table={table}
        searchPlaceholder={t('users.search')}
        searchKey='username'
        filters={[
          {
            columnId: 'status',
            title: t('users.status'),
            options: statusValues.map((value) => ({
              value,
              label: t(`users.statuses.${value}`),
            })),
          },
          {
            columnId: 'role',
            title: t('users.role'),
            options: roleValues.map((value) => ({
              value,
              label: t(`users.roles.${value}`),
            })),
          },
        ]}
      />
      <div
        ref={viewportRef}
        data-testid='users-table-viewport'
        className='@container min-h-0 flex-1 overflow-hidden rounded-md border [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto'
      >
        {isMobile ? (
          <div
            data-users-mobile
            className='h-full overflow-y-auto overscroll-contain'
          >
            {table.getRowModel().rows.length ? (
              <ul aria-label={t('users.title')} className='divide-y'>
                {table.getRowModel().rows.map((row) => (
                  <UserMobileRow key={row.id} row={row} />
                ))}
              </ul>
            ) : (
              <div className='flex h-24 items-center justify-center text-sm'>
                {emptyState}
              </div>
            )}
          </div>
        ) : (
          <Table aria-label={t('users.title')}>
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
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-testid='user-row'
                    className='group/row align-middle transition-colors'
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'bg-background align-middle group-hover/row:bg-muted/60',
                          cell.column.columnDef.meta?.className,
                          cell.column.columnDef.meta?.tdClassName
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={table.getVisibleLeafColumns().length}
                    className='p-0'
                  >
                    <div className='sticky left-0 flex h-24 w-[100cqw] max-w-full items-center justify-center'>
                      {emptyState}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
      {canRead && query.isError && (
        <RequestErrorToast
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      )}
      <fieldset disabled={!canPaginate} className='contents'>
        <DataTablePagination table={table} className='shrink-0' />
      </fieldset>
    </div>
  )
}
