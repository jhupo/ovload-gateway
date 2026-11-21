import { useTranslation } from 'react-i18next'
import { useClock } from '@/hooks/use-clock'
import { useCommercePage } from '@/hooks/use-commerce-page'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { ServerPagination } from '@/components/data-table/server-pagination'
import { QueryState } from '@/components/query-state'
import { type Plan, statusOf } from './data'

export function PlanSubscribers({
  plan,
  onClose,
  restoreFocus,
}: {
  plan: Plan | null
  onClose: () => void
  restoreFocus: () => void
}) {
  const { users, records, ready, error, refresh, tableState } = useCommercePage(
    'subscribers',
    { plan: plan?.id ?? '' }
  )
  const { t, i18n } = useTranslation()
  const now = useClock()
  const active = records.filter(
    (row) => row.plan.id === plan?.id && statusOf(row, now) === 'active'
  )
  const subscribers = [...new Set(active.map((row) => row.userId))].map(
    (id) => ({
      user: users.find((user) => user.id === id) ?? {
        id,
        username: id,
        email: '',
      },
      end: active
        .filter((row) => row.userId === id)
        .map((row) => row.end)
        .sort()
        .at(-1)!,
    })
  )
  return (
    <Dialog
      open={!!plan}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className='flex max-h-[85dvh] flex-col sm:max-w-xl'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t('subscriptions.subscribersFor', { name: plan?.name })}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('subscriptions.active')}
          </DialogDescription>
        </DialogHeader>
        {!ready ? (
          <QueryState error={error} retry={refresh} />
        ) : (
          <div className='min-h-0 overflow-auto [&>[data-slot=table-container]]:overflow-visible'>
            <Table className='table-fixed'>
              <TableHeader className='sticky top-0 z-10 bg-background'>
                <TableRow>
                  <TableHead>{t('subscriptions.user')}</TableHead>
                  <TableHead className='w-28 text-left'>
                    {t('subscriptions.expires')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map(({ user, end }) => (
                  <TableRow key={user.id}>
                    <TableCell className='py-3'>
                      <p className='truncate font-medium'>{user.username}</p>
                      <p
                        className='truncate text-xs text-muted-foreground'
                        title={user.email}
                      >
                        {user.email}
                      </p>
                    </TableCell>
                    <TableCell className='text-left text-xs tabular-nums'>
                      {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                        timeZone: plan?.timezone,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      }).format(new Date(end))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!subscribers.length && (
              <p className='p-8 text-center text-sm text-muted-foreground'>
                {t('common.no_data')}
              </p>
            )}
          </div>
        )}
        <ServerPagination state={tableState} />
      </DialogContent>
    </Dialog>
  )
}
