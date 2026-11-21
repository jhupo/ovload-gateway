import { useState } from 'react'
import { ArrowRight, CalendarDays, PackageOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { useMoneyFormat } from '@/hooks/use-money-format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ServerPagination } from '@/components/data-table/server-pagination'
import { QueryState } from '@/components/query-state'
import type { Plan } from '@/features/subscriptions/data'

export function PlanList() {
  const { t } = useTranslation()
  const tr = (key: string) => t(`userRecharge.${key}`)
  const money = useMoneyFormat()
  const {
    plans: published,
    execute,
    busy,
    ready,
    error,
    refresh,
    tableState,
  } = useCommercePage('plans')
  const [selected, setSelected] = useState<Plan | null>(null)
  if (!ready) return <QueryState error={error} retry={refresh} />
  if (!published.length)
    return (
      <div className='flex min-h-60 flex-col items-center justify-center gap-3 text-sm text-muted-foreground'>
        <PackageOpen className='size-6' aria-hidden='true' />
        {t('commerce.noPlans')}
      </div>
    )
  return (
    <>
      <div className='grid items-stretch gap-4 @2xl/recharge:grid-cols-2 @5xl/recharge:grid-cols-3'>
        {published.map((plan) => (
          <Card
            key={plan.id}
            className='min-w-0 gap-5 rounded-lg p-5 shadow-none'
            data-testid='available-plan'
          >
            <div className='space-y-2'>
              <h3 className='text-base font-semibold break-words'>
                {plan.name}
              </h3>
              {plan.description && (
                <div className='text-sm break-words text-muted-foreground'>
                  {plan.description}
                </div>
              )}
            </div>
            <div className='space-y-2'>
              <div className='flex flex-wrap items-baseline gap-2'>
                <span className='text-2xl font-semibold tabular-nums'>
                  {money(plan.priceCents)}
                </span>
                {plan.originalPriceCents > plan.priceCents && (
                  <del className='text-xs text-muted-foreground tabular-nums'>
                    {money(plan.originalPriceCents)}
                  </del>
                )}
              </div>
              <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                <CalendarDays className='size-3.5' aria-hidden='true' />
                {t('userRecharge.duration', { count: plan.days })}
              </div>
            </div>
            <dl className='space-y-3 border-t pt-4 text-sm'>
              {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                <div
                  className='flex flex-wrap justify-between gap-2'
                  key={period}
                >
                  <dt className='text-muted-foreground'>{tr(period)}</dt>
                  <dd className='font-medium tabular-nums'>
                    {plan.unlimited[period]
                      ? tr('unlimited')
                      : money(plan[`${period}Cents`])}
                  </dd>
                </div>
              ))}
            </dl>
            {plan.features && (
              <ul className='space-y-2 text-sm break-words'>
                {plan.features
                  .split('\n')
                  .filter((line) => line.trim())
                  .map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
              </ul>
            )}
            <Button
              variant='outline'
              className='mt-auto w-full'
              disabled={busy}
              onClick={() => setSelected(plan)}
            >
              {t('commerce.buyPlan')}
              <ArrowRight className='size-4' />
            </Button>
          </Card>
        ))}
      </div>
      <ServerPagination state={tableState} />
      <ConfirmDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={t('commerce.buyPlan')}
        desc={t('commerce.purchaseDescription', {
          name: selected?.name,
          amount: money(selected?.priceCents ?? 0),
        })}
        confirmText={t('commerce.payWallet')}
        disabled={busy}
        handleConfirm={() => {
          if (!selected) return
          void execute({
            action: 'purchase',
            plan_id: selected.id,
            revision: selected.revision,
          })
            .then(() => {
              setSelected(null)
              toast.success(t('commerce.purchased'))
            })
            .catch(() => {})
        }}
      />
    </>
  )
}
