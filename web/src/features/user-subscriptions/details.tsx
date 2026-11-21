import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  type UserSubscription,
  personalSubscriptionStatus,
  quotaPeriods,
} from './data'
import { useSubscriptionFormat } from './format'
import { SubscriptionStatusBadge } from './presentation'

export function SubscriptionDetails({
  record,
  onClose,
  restoreFocus,
}: {
  record: UserSubscription
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`userSubscriptions.${key}`)
  const format = useSubscriptionFormat()
  const fields = [
    [tr('id'), record.id],
    [tr('paid'), format.cents(record.priceCents)],
    [tr('startsAt'), format.date(record.startsAt)],
    [tr('expiresAt'), format.date(record.expiresAt)],
    ...quotaPeriods.map((period) => [
      tr(period),
      record.quotas[period].limitMicros === null
        ? tr('unlimited')
        : format.micros(record.quotas[period].limitMicros),
    ]),
  ]
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <DialogTitle>{tr('details')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {tr('detailsDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 space-y-5 overflow-y-auto p-5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-lg font-semibold'>{record.plan}</h3>
            <SubscriptionStatusBadge
              status={personalSubscriptionStatus(record)}
            />
          </div>
          <dl className='space-y-4 text-sm'>
            {fields.map(([label, value]) => (
              <div
                key={label}
                className='flex items-baseline justify-between gap-4'
              >
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='min-w-0 text-end break-all tabular-nums'>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <DialogFooter className='border-t px-5 py-4'>
          <Button variant='outline' onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
