import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { upstreamAccounts, type UpstreamAccount } from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RequestErrorToast } from '@/components/request-error-toast'

export function AccountConcurrencyDialog({
  account,
  onOpenChange,
}: {
  account: UpstreamAccount | null
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const owner = useIdentitySession((state) => state.session?.id)
  const [page, setPage] = useState(1)
  const open = !!account
  const query = useQuery({
    queryKey: ['account-concurrency', owner, account?.id, page],
    queryFn: ({ signal }) =>
      upstreamAccounts.concurrency(account!.id, page, 20, signal),
    enabled: open && !!owner,
    staleTime: 0,
    retry: false,
    refetchInterval: open ? 2000 : false,
    refetchIntervalInBackground: false,
  })
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'short',
          timeStyle: 'medium',
          timeZone: 'UTC',
        }).format(new Date(value))
      : '—'
  const duration = (value: number | null) => {
    if (value == null) return '—'
    if (value < 1000) return `${value} ms`
    return `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value / 1000)} s`
  }
  const limit = account?.capacity.totalSlots
  const total = query.data?.total
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPage(1)
        onOpenChange(next)
      }}
    >
      <DialogContent className='w-[min(calc(100%-2rem),56rem)] max-w-none'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Activity className='size-5 text-primary' aria-hidden='true' />
            {t('upstreamAccounts.concurrencyDetails')}
          </DialogTitle>
          <DialogDescription className='truncate'>
            {account?.name ?? ''}
          </DialogDescription>
        </DialogHeader>
        <RequestErrorToast
          message={
            query.error instanceof Error ? query.error.message : undefined
          }
          retry={() => void query.refetch()}
        />
        <Card>
          <CardContent className='grid gap-4 py-4 sm:grid-cols-3'>
            <div>
              <p className='text-xs text-muted-foreground'>
                {t('upstreamAccounts.activeConcurrency')}
              </p>
              <p className='mt-1 text-xl font-semibold tabular-nums'>
                {total ?? '—'}{' '}
                <span className='text-sm font-normal text-muted-foreground'>
                  / {limit == null ? t('upstreamAccounts.unlimited') : limit}
                </span>
              </p>
            </div>
            <div className='sm:col-span-2 sm:text-right'>
              <p className='text-xs text-muted-foreground'>
                {t('upstreamAccounts.observedAt')}
              </p>
              <p className='mt-1 text-sm tabular-nums'>
                {date(query.data?.observedAt ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
        <div className='flex items-center justify-between gap-2'>
          <Badge variant={query.isError ? 'destructive' : 'secondary'}>
            {query.isError
              ? t('upstreamAccounts.failed')
              : query.isFetching
                ? t('upstreamAccounts.loading')
                : t('upstreamAccounts.activeConcurrency')}
          </Badge>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={query.isFetching ? 'size-4 animate-spin' : 'size-4'}
            />
            {t('upstreamAccounts.refreshConcurrency')}
          </Button>
        </div>
        <div className='max-h-[min(24rem,45vh)] overflow-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('upstreamAccounts.model')}</TableHead>
                <TableHead>{t('upstreamAccounts.client')}</TableHead>
                <TableHead>{t('upstreamAccounts.started')}</TableHead>
                <TableHead className='text-right'>
                  {t('upstreamAccounts.occupied')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.entries.length ? (
                query.data.entries.map((entry) => (
                  <TableRow key={entry.leaseId}>
                    <TableCell className='max-w-56 truncate font-medium'>
                      {entry.model ?? '—'}
                    </TableCell>
                    <TableCell className='max-w-56 truncate'>
                      {entry.clientKeyName ??
                        entry.clientKeyId ??
                        entry.clientIp ??
                        '—'}
                    </TableCell>
                    <TableCell className='whitespace-nowrap tabular-nums'>
                      {entry.startedAtDisplay ?? date(entry.startedAt)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {duration(entry.occupiedMs)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className='h-24 text-center text-muted-foreground'
                  >
                    {query.isError && !query.data
                      ? t('upstreamAccounts.failed')
                      : query.isLoading
                        ? t('upstreamAccounts.loading')
                        : t('upstreamAccounts.noActiveConcurrency')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {(query.data?.total ?? 0) > 20 || page > 1 ? (
          <div className='flex justify-end gap-2'>
            <Button
              size='icon-sm'
              variant='outline'
              aria-label={t('upstreamAccounts.previous')}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className='self-center text-sm tabular-nums'>{page}</span>
            <Button
              size='icon-sm'
              variant='outline'
              aria-label={t('upstreamAccounts.next')}
              disabled={page * 20 >= (query.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
