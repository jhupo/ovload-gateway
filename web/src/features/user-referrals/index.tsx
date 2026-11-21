import { useId, useRef, useState } from 'react'
import { ArrowRightLeft, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatUsd } from '@/lib/usd'
import { useEngagement, type ReferralState } from '@/hooks/use-engagement'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ContentSection } from '@/features/settings/components/content-section'
import { InvitationRecords, RebateRecords, TransferRecords } from './records'

function InvitationField({
  label,
  copyLabel,
  value,
}: {
  label: string
  copyLabel: string
  value: string
}) {
  const id = useId()
  const { t } = useTranslation()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='flex gap-2'>
        <Input
          id={id}
          readOnly
          value={value}
          placeholder={t('featureAvailability.unknown')}
          className='min-w-0 font-mono text-xs'
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='size-9 shrink-0'
              aria-label={copyLabel}
              disabled={!value}
              onClick={() => {
                void navigator.clipboard
                  .writeText(value)
                  .then(() => toast.success(copyLabel))
                  .catch(() => toast.error(t('auth.error')))
              }}
            >
              <Copy className='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copyLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export function UserReferrals() {
  const { t, i18n } = useTranslation()
  const state = useEngagement<ReferralState>('referrals')
  const data = state.data
  const [transferring, setTransferring] = useState(false)
  const transferKey = useRef(crypto.randomUUID())
  const tr = (key: string) => t(`personalReferrals.${key}`)
  const stats = [
    ['available', formatUsd(data?.summary.available, i18n.language)],
    ['frozenBalance', formatUsd(data?.summary.frozen, i18n.language)],
    ['total', formatUsd(data?.summary.total, i18n.language)],
    ['invited', String(data?.summary.invited ?? 0)],
  ]
  return (
    <ContentSection title={t('sidebar.referrals')}>
      <div className='min-w-0 space-y-7'>
        <section className='space-y-4' aria-label={tr('overview')}>
          <dl className='grid grid-cols-2 gap-x-5 gap-y-6 @3xl/profile:grid-cols-4'>
            {stats.map(([key, value]) => (
              <div key={key} className='min-w-0 space-y-2'>
                <dt className='text-xs text-muted-foreground'>{tr(key)}</dt>
                <dd
                  className='text-xl font-semibold break-words tabular-nums'
                  data-testid={`referral-${key}`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <dl className='flex flex-wrap gap-x-6 gap-y-2 text-xs'>
              <div className='flex gap-2'>
                <dt className='text-muted-foreground'>{tr('rate')}</dt>
                <dd className='font-medium'>{data?.rate ?? '0'}%</dd>
              </div>
              <div className='flex gap-2'>
                <dt className='text-muted-foreground'>{tr('freeze')}</dt>
                <dd className='font-medium'>{data?.freezeHours ?? '0'}h</dd>
              </div>
            </dl>
            <Button
              variant='outline'
              disabled={
                !data || Number(data.summary.available) <= 0 || state.busy
              }
              onClick={() => setTransferring(true)}
            >
              <ArrowRightLeft className='size-4' />
              {tr('transfer')}
            </Button>
          </div>
        </section>
        <section
          className='grid min-w-0 gap-5 @2xl/profile:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
          aria-label={tr('invitation')}
        >
          <InvitationField
            label={tr('code')}
            copyLabel={tr('copyCode')}
            value={data?.summary.code ?? ''}
          />
          <InvitationField
            label={tr('link')}
            copyLabel={tr('copyLink')}
            value={
              data?.summary.code
                ? `${window.location.origin}/sign-up?ref=${encodeURIComponent(data.summary.code)}`
                : ''
            }
          />
        </section>
        <Tabs defaultValue='invitations' className='min-w-0 gap-4'>
          <TabsList
            aria-label={tr('records')}
            className='h-auto max-w-full flex-wrap justify-start'
          >
            {['invitations', 'rebates', 'transfers'].map((key) => (
              <TabsTrigger key={key} value={key}>
                {tr(key)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value='invitations' className='m-0'>
            <InvitationRecords />
          </TabsContent>
          <TabsContent value='rebates' className='m-0'>
            <RebateRecords />
          </TabsContent>
          <TabsContent value='transfers' className='m-0'>
            <TransferRecords />
          </TabsContent>
        </Tabs>
        <ConfirmDialog
          open={transferring}
          onOpenChange={setTransferring}
          isLoading={state.busy}
          title={tr('transfer')}
          desc={t('personalReferrals.transferDescription', {
            amount: formatUsd(data?.summary.available, i18n.language),
          })}
          handleConfirm={async () => {
            try {
              await state.execute({
                op: 'transfer_referral',
                key: transferKey.current,
              })
              setTransferring(false)
              transferKey.current = crypto.randomUUID()
              toast.success(t('identity.saved'))
            } catch {
              /* The request hook displays the error. */
            }
          }}
        />
      </div>
    </ContentSection>
  )
}
