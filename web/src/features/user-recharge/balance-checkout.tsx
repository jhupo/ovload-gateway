import { useTranslation } from 'react-i18next'
import type { PaymentQuote } from '@/api/payments'
import { formatUsd } from '@/lib/usd'
import { useWorkspaceProfile } from '@/hooks/use-workspace-profile'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function BalanceCheckout({
  balanceUsd,
  quote,
  disabled,
}: {
  balanceUsd?: string
  quote?: PaymentQuote
  disabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`userRecharge.${key}`)
  const { profile } = useWorkspaceProfile()
  const unknown = t('featureAvailability.unknown')
  return (
    <Card
      className='min-w-0 gap-0 self-start overflow-hidden rounded-lg py-0 shadow-none'
      data-testid='recharge-order-summary'
    >
      <div className='grid grid-cols-2 gap-3 p-4'>
        <div className='min-w-0 space-y-1'>
          <div className='text-xs text-muted-foreground'>{tr('account')}</div>
          <div className='text-sm font-semibold break-words'>
            {profile.username || unknown}
          </div>
        </div>
        <div className='min-w-0 space-y-1 text-right'>
          <div className='text-xs text-muted-foreground'>{tr('balance')}</div>
          <div className='text-sm font-semibold break-words tabular-nums'>
            {formatUsd(balanceUsd, i18n.language)}
          </div>
        </div>
      </div>
      <div className='space-y-2 border-y bg-muted/40 p-4'>
        <h4 className='text-xs font-medium text-muted-foreground'>
          {tr('total')}
        </h4>
        <div
          className='text-2xl font-semibold break-words tabular-nums'
          data-testid='recharge-payment-total'
        >
          {quote ? `¥${quote.totalCny}` : unknown}
        </div>
      </div>
      <div className='space-y-4 p-4'>
        <h4 className='sr-only'>{tr('review')}</h4>
        <dl className='text-sm'>
          <div className='flex flex-wrap justify-between gap-2'>
            <dt className='text-muted-foreground'>{tr('method')}</dt>
            <dd data-testid='recharge-selected-method'>{tr('alipay')}</dd>
          </div>
        </dl>
        <dl className='space-y-3 text-sm'>
          {[
            ['amount', quote && `¥${quote.amountCny}`],
            ['fee', quote && `¥${quote.feeCny}`],
            ['credit', quote && formatUsd(quote.creditUsd, i18n.language)],
          ].map(([key, value]) => (
            <div key={key} className='flex flex-wrap justify-between gap-2'>
              <dt className='text-muted-foreground'>{tr(key!)}</dt>
              <dd className='tabular-nums'>{value ?? unknown}</dd>
            </div>
          ))}
        </dl>
        <div className='space-y-3 border-t pt-3'>
          <Button type='submit' className='w-full' disabled={disabled}>
            {tr('confirmPayment')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
