import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useClock } from '@/hooks/use-clock'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ServerPagination } from '@/components/data-table/server-pagination'
import { DateTimePicker } from '@/components/date-time-picker'
import { type Plan, type Subscription, day, money } from './data'
import { Editor } from './editor'
import { SearchChoice } from './fields'

const inputTime = (iso: string, zone: Plan['timezone']) =>
  new Date(Date.parse(iso) + (zone === 'Asia/Shanghai' ? 8 * 3_600_000 : 0))
    .toISOString()
    .slice(0, 16)
export function SubscriptionEditor({
  initial,
  plans,
  onClose,
  restoreFocus,
}: {
  initial?: Subscription
  plans: Plan[]
  onClose: () => void
  restoreFocus: () => void
}) {
  const [userSearch, setUserSearch] = useState(initial?.userId ?? '')
  const { users, execute, busy, tableState } = useCommercePage('users', {
    search: userSearch,
    status: 'active',
  })
  const { t } = useTranslation()
  const id = useId()
  const [userId, setUserId] = useState(initial?.userId ?? '')
  const [planId, setPlanId] = useState(initial?.plan.id ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [end, setEnd] = useState(
    initial ? inputTime(initial.end, initial.plan.timezone) : ''
  )
  const [submitted, setSubmitted] = useState(false)
  const now = useClock()
  const plan =
    initial?.plan ?? plans.find((p) => p.id === planId && p.published)
  const expiry = initial
    ? Date.parse(
        end + (initial.plan.timezone === 'Asia/Shanghai' ? '+08:00' : 'Z')
      )
    : now + (plan?.days ?? 0) * day
  const valid =
    plan &&
    users.some((u) => u.id === userId && (initial || u.status === 'active')) &&
    Number.isFinite(expiry) &&
    expiry > now &&
    expiry <= now + 3650 * day
  const dirty =
    userId !== (initial?.userId ?? '') ||
    planId !== (initial?.plan.id ?? '') ||
    notes !== (initial?.notes ?? '') ||
    end !== (initial ? inputTime(initial.end, initial.plan.timezone) : '')
  const user = users.find((u) => u.id === userId)
  return (
    <Editor
      title={t('subscriptions.' + (initial ? 'adjust' : 'assign'))}
      dirty={dirty}
      onClose={onClose}
      restoreFocus={restoreFocus}
      action={t(initial ? 'common.save' : 'subscriptions.assign')}
      busy={busy}
      onSave={() => {
        setSubmitted(true)
        if (!valid) {
          toast.error(t('subscriptions.invalid.assignment'))
          return
        }
        void execute(
          initial
            ? {
                action: 'adjust',
                id: initial.id,
                revision: initial.revision,
                ends_at: new Date(expiry).toISOString(),
                notes,
              }
            : { action: 'assign', user_id: userId, plan_id: planId, notes }
        )
          .then(onClose)
          .catch(() => {})
      }}
    >
      <div className='space-y-5'>
        {initial ? (
          <div className='space-y-1'>
            <p className='font-medium'>{user?.username}</p>
            <p className='text-sm text-muted-foreground'>{user?.email}</p>
            <p className='pt-2 text-sm'>{plan?.name}</p>
          </div>
        ) : (
          <>
            <SearchChoice
              label={t('subscriptions.user')}
              onSearch={setUserSearch}
              footer={<ServerPagination state={tableState} />}
              value={userId}
              onChange={setUserId}
              options={users
                .filter((u) => u.status === 'active')
                .map((u) => ({
                  value: u.id,
                  label: u.username,
                  detail: u.email,
                }))}
            />
            <SearchChoice
              label={t('subscriptions.plan')}
              value={planId}
              onChange={setPlanId}
              options={plans
                .filter((p) => p.published)
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  detail:
                    money(p.priceCents) +
                    ' · ' +
                    p.days +
                    ' ' +
                    t('subscriptions.days'),
                }))}
            />
          </>
        )}
        {plan && (
          <>
            <div className='grid grid-cols-2 divide-x rounded-lg bg-muted/50 py-4'>
              <div className='space-y-1 px-4'>
                <p className='text-xs text-muted-foreground'>
                  {t('subscriptions.dailyLimit')}
                </p>
                <p className='font-semibold tabular-nums'>
                  {plan.unlimited.daily
                    ? t('subscriptions.unlimited')
                    : money(plan.dailyCents)}
                </p>
              </div>
              <div className='space-y-1 px-4'>
                <p className='text-xs text-muted-foreground'>
                  {t('subscriptions.monthlyLimit')}
                </p>
                <p className='font-semibold tabular-nums'>
                  {plan.unlimited.monthly
                    ? t('subscriptions.unlimited')
                    : money(plan.monthlyCents)}
                </p>
              </div>
            </div>
            {initial ? (
              <div className='space-y-2'>
                <Label htmlFor={`${id}-expires`}>
                  {t('subscriptions.expires')}
                </Label>
                <DateTimePicker
                  id={`${id}-expires`}
                  label={t('subscriptions.expires')}
                  value={end}
                  onChange={setEnd}
                  aria-invalid={submitted && !valid}
                  aria-describedby={
                    submitted && !valid ? `${id}-expires-error` : undefined
                  }
                />
                {submitted && !valid && (
                  <p
                    id={`${id}-expires-error`}
                    role='alert'
                    className='sr-only'
                  >
                    {t('subscriptions.invalid.end')}
                  </p>
                )}
              </div>
            ) : (
              <div className='grid grid-cols-2 gap-4 text-sm'>
                <div>
                  <p className='mb-1 text-xs text-muted-foreground'>
                    {t('subscriptions.starts')}
                  </p>
                  <p className='tabular-nums'>
                    {inputTime(
                      new Date(now).toISOString(),
                      plan.timezone
                    ).replace('T', ' ')}
                  </p>
                </div>
                <div>
                  <p className='mb-1 text-xs text-muted-foreground'>
                    {t('subscriptions.expires')}
                  </p>
                  <p className='tabular-nums'>
                    {inputTime(
                      new Date(expiry).toISOString(),
                      plan.timezone
                    ).replace('T', ' ')}
                  </p>
                </div>
              </div>
            )}
            <p className='text-xs text-muted-foreground'>{plan.timezone}</p>
          </>
        )}
        <div className='space-y-2'>
          <Label htmlFor={id}>{t('subscriptions.notes')}</Label>
          <Textarea
            id={id}
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            className='min-h-20'
          />
        </div>
        {submitted && !valid && !initial && (
          <p role='alert' className='sr-only'>
            {t('subscriptions.invalid.assignment')}
          </p>
        )}
      </div>
    </Editor>
  )
}
