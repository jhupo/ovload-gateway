import { useTranslation } from 'react-i18next'
import type { ActiveRequest } from '@/api/monitoring'
import { accountProviderLabel } from '@/lib/upstream-platforms'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePaginationControls } from '@/components/data-table/pagination'

export function ActiveRequests({
  rows,
  summary,
  page,
  size,
  onPageChange,
  onPageSizeChange,
}: {
  rows?: ActiveRequest[]
  summary?: { total: number; users: number; threads: number }
  page: number
  size: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const { t } = useTranslation()
  return (
    // ai-design-check-ignore-next-line use-shared-looks -- Preserve the established telemetry panel and its bounded scrolling layout.
    <section
      data-testid='active-requests'
      aria-labelledby='active-requests-title'
      className='flex max-h-[256px] min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm xl:h-[312px] xl:max-h-none [&_[data-slot=table-container]]:min-h-0 [&_[data-slot=table-container]]:flex-1 [&_[data-slot=table-container]]:overflow-x-hidden [&_[data-slot=table-container]]:overflow-y-auto'
    >
      <div className='flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2 sm:px-5'>
        {/* ai-design-check-ignore-next-line use-shared-looks -- Existing section heading; the project has no shared Heading component. */}
        <h2
          id='active-requests-title'
          className='flex min-w-0 items-center gap-2 text-sm font-semibold'
        >
          <span
            className='size-2.5 shrink-0 rounded-full bg-muted-foreground/40'
            aria-hidden
          />
          <span className='truncate'>
            {t('monitoring.activeRequests.title')}
          </span>
        </h2>
        <span
          data-testid='active-request-summary'
          className='text-xs text-muted-foreground'
        >
          {rows
            ? t('monitoring.activeRequests.summary', {
                users: summary?.users ?? 0,
                threads: summary?.threads ?? 0,
              })
            : '-'}
        </span>
      </div>
      <Table className='w-full table-fixed'>
        <colgroup>
          <col className='w-[28%]' />
          <col className='w-[24%]' />
          <col className='w-[25%]' />
          <col className='w-[23%]' />
        </colgroup>
        <TableHeader className='sticky top-0 z-10 bg-card'>
          <TableRow className='hover:bg-transparent'>
            {['user', 'provider', 'concurrency', 'status'].map((key) => (
              <TableHead
                key={key}
                className='overflow-hidden px-3 text-xs text-ellipsis text-muted-foreground sm:text-xs'
              >
                {t(`monitoring.activeRequests.${key}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((request) => (
            <TableRow
              key={`${request.id}:${request.provider}:${request.status}`}
              data-testid='active-request-row'
            >
              <TableCell className='overflow-hidden px-3 py-3'>
                <span
                  className='block truncate text-xs font-medium'
                  title={request.user}
                >
                  {request.user}
                </span>
              </TableCell>
              <TableCell className='px-1 text-xs'>
                {request.provider
                  ? accountProviderLabel(request.provider)
                  : '-'}
              </TableCell>
              <TableCell className='px-1'>
                <div className='flex items-center gap-1.5'>
                  {request.status === 'processing' && (
                    <Progress
                      value={
                        request.limit
                          ? Math.min(
                              100,
                              (request.concurrent / request.limit) * 100
                            )
                          : null
                      }
                      aria-label={t(
                        'monitoring.activeRequests.concurrencyFor',
                        {
                          user: request.user,
                        }
                      )}
                      className='h-1.5 flex-1'
                    />
                  )}
                  <span className='text-xs tabular-nums'>
                    {request.concurrent}
                    {request.status === 'processing'
                      ? `/${request.limit || '—'}`
                      : ''}
                  </span>
                </div>
              </TableCell>
              <TableCell className='px-1 pe-3 text-left'>
                <Badge variant='outline'>
                  {t(`monitoring.activeRequests.statuses.${request.status}`)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {!rows?.length && (
            <TableRow>
              <TableCell colSpan={4} className='h-36'>
                <div className='flex justify-center'>
                  <span className='text-sm text-muted-foreground'>
                    {t('data_table.no_results')}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {!!summary?.total && (
        <DataTablePaginationControls
          pageIndex={page}
          pageSize={size}
          pageCount={Math.ceil((summary?.total ?? 0) / size)}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          className='px-3 py-2'
        />
      )}
    </section>
  )
}
