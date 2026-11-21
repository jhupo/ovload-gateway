import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCommerce } from '@/hooks/use-commerce'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { type Plan, parseCents } from './data'
import { Editor } from './editor'
import { Choice, Field } from './fields'

export function PlanEditor({
  initial,
  creating,
  onClose,
  restoreFocus,
}: {
  initial: Plan
  creating: boolean
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const { execute, busy } = useCommerce()
  const original = {
    name: initial.name,
    description: initial.description,
    // ai-design-check-ignore-next-line locale-number-format -- Editable decimal strings use the dot separator required by parseCents, not display formatting.
    originalPrice: (initial.originalPriceCents / 100).toFixed(2),
    // ai-design-check-ignore-next-line locale-number-format -- Editable decimal strings use the dot separator required by parseCents, not display formatting.
    weekly: (initial.weeklyCents / 100).toFixed(2),
    unlimited: initial.unlimited,
    sort: String(initial.sort),
    features: initial.features,
    // ai-design-check-ignore-next-line locale-number-format -- Editable decimal strings use the dot separator required by parseCents, not display formatting.
    price: (initial.priceCents / 100).toFixed(2),
    days: String(initial.days),
    // ai-design-check-ignore-next-line locale-number-format -- Editable decimal strings use the dot separator required by parseCents, not display formatting.
    daily: (initial.dailyCents / 100).toFixed(2),
    // ai-design-check-ignore-next-line locale-number-format -- Editable decimal strings use the dot separator required by parseCents, not display formatting.
    monthly: (initial.monthlyCents / 100).toFixed(2),
    resetTime: initial.resetTime,
    timezone: initial.timezone,
    notes: initial.notes,
    published: initial.published,
  }
  const [draft, setDraft] = useState(original)
  const [submitted, setSubmitted] = useState(false)
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K]
  ) => setDraft((d) => ({ ...d, [key]: value }))
  const cents = {
    price: parseCents(draft.price),
    originalPrice: parseCents(draft.originalPrice),
    weekly: parseCents(draft.weekly),
    daily: parseCents(draft.daily),
    monthly: parseCents(draft.monthly),
  }
  const valid = {
    name: Boolean(draft.name.trim()),
    originalPrice:
      cents.originalPrice !== null &&
      (cents.originalPrice === 0 ||
        (cents.price !== null && cents.originalPrice >= cents.price)),
    weekly:
      draft.unlimited.weekly || (cents.weekly !== null && cents.weekly > 0),
    sort: /^\d{1,6}$/.test(draft.sort),
    price: cents.price !== null && cents.price > 0,
    days:
      /^\d+$/.test(draft.days) &&
      Number(draft.days) >= 1 &&
      Number(draft.days) <= 3650,
    daily: draft.unlimited.daily || (cents.daily !== null && cents.daily > 0),
    monthly:
      draft.unlimited.monthly || (cents.monthly !== null && cents.monthly > 0),
    resetTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.resetTime),
  }
  const error = (key: keyof typeof valid) =>
    submitted && !valid[key] ? t('subscriptions.invalid.' + key) : undefined
  return (
    <Editor
      title={t('subscriptions.' + (creating ? 'createPlan' : 'editPlan'))}
      dirty={JSON.stringify(draft) !== JSON.stringify(original)}
      onClose={onClose}
      restoreFocus={restoreFocus}
      action={t('common.save')}
      busy={busy}
      onSave={() => {
        setSubmitted(true)
        if (!Object.values(valid).every(Boolean)) {
          toast.error(t('redemption.invalid'))
          return
        }
        const document = {
          name: draft.name.trim(),
          description: draft.description,
          notes: draft.notes,
          priceCents: cents.price,
          originalPriceCents: cents.originalPrice,
          dailyCents: cents.daily ?? 0,
          weeklyCents: cents.weekly ?? 0,
          monthlyCents: cents.monthly ?? 0,
          unlimited: draft.unlimited,
          days: Number(draft.days),
          sort: Number(draft.sort),
          currencyLabel: 'USD',
          features: draft.features,
          resetTime: draft.resetTime,
          timezone: draft.timezone,
          published: draft.published,
        }
        void execute({
          action: 'save_plan',
          id: creating ? null : initial.id,
          revision: initial.revision ?? null,
          document,
        })
          .then(onClose)
          .catch(() => {})
      }}
    >
      <div className='space-y-5'>
        <Field
          label={t('subscriptions.planName')}
          value={draft.name}
          onChange={(v) => update('name', v)}
          error={error('name')}
          maxLength={60}
        />
        <div className='space-y-2'>
          <Label htmlFor={id + 'description'}>
            {t('subscriptions.description')}
          </Label>
          {/* ai-design-check-ignore-next-line no-style-overrides -- Preserve existing compact multiline field heights while removing the currency field. */}
          <Textarea
            id={id + 'description'}
            maxLength={200}
            value={draft.description}
            onChange={(e) => update('description', e.target.value)}
            className='min-h-16'
          />
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <Field
            label={t('subscriptions.price')}
            value={draft.price}
            onChange={(v) => update('price', v)}
            error={error('price')}
            suffix='$'
          />
          <Field
            label={t('subscriptions.originalPrice')}
            value={draft.originalPrice}
            onChange={(v) => update('originalPrice', v)}
            error={error('originalPrice')}
            suffix='$'
          />
          <Field
            label={t('subscriptions.duration')}
            value={draft.days}
            onChange={(v) => update('days', v)}
            error={error('days')}
            suffix={t('subscriptions.days')}
          />
          <Field
            label={t('subscriptions.sort')}
            value={draft.sort}
            onChange={(v) => update('sort', v)}
            error={error('sort')}
          />
        </div>
        <div className='grid gap-4 sm:grid-cols-3'>
          {(['daily', 'weekly', 'monthly'] as const).map((period) => (
            <div key={period} className='space-y-3'>
              <Field
                label={t('subscriptions.' + period + 'Limit')}
                value={draft[period]}
                onChange={(v) => update(period, v)}
                disabled={draft.unlimited[period]}
                error={draft.unlimited[period] ? undefined : error(period)}
                suffix='$'
              />
              <div className='flex items-center gap-2'>
                <SwitchLabeled
                  id={id + period}
                  checked={draft.unlimited[period]}
                  onCheckedChange={(v) =>
                    update('unlimited', { ...draft.unlimited, [period]: v })
                  }
                />
                <Label htmlFor={id + period} className='text-xs'>
                  {t('subscriptions.unlimited')}
                </Label>
              </div>
            </div>
          ))}
        </div>
        <div className='space-y-2'>
          <Label htmlFor={id + 'features'}>{t('subscriptions.features')}</Label>
          {/* ai-design-check-ignore-next-line no-style-overrides -- Preserve existing compact multiline field heights while removing the currency field. */}
          <Textarea
            id={id + 'features'}
            value={draft.features}
            onChange={(e) => update('features', e.target.value)}
            maxLength={500}
          />
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <Field
            label={t('subscriptions.dailyReset')}
            value={draft.resetTime}
            onChange={(v) => update('resetTime', v)}
            type='time'
            error={error('resetTime')}
          />
          <div className='space-y-2'>
            <Label>{t('subscriptions.monthlyReset')}</Label>
            <div className='flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm'>
              {t('subscriptions.anniversary')}
            </div>
          </div>
        </div>
        <Choice
          label={t('subscriptions.timezone')}
          value={draft.timezone}
          onChange={(v) => update('timezone', v as Plan['timezone'])}
          options={['Asia/Shanghai', 'UTC'].map((value) => ({
            value,
            label: value,
          }))}
        />
        <div className='space-y-2'>
          <Label htmlFor={id + '-notes'}>{t('subscriptions.notes')}</Label>
          {/* ai-design-check-ignore-next-line no-style-overrides -- Preserve existing compact multiline field heights while removing the currency field. */}
          <Textarea
            id={id + '-notes'}
            value={draft.notes}
            maxLength={500}
            onChange={(e) => update('notes', e.target.value)}
            className='min-h-20'
          />
        </div>
        <div className='flex items-center justify-between'>
          <Label htmlFor={id + '-published'}>
            {t('subscriptions.publish')}
          </Label>
          <SwitchLabeled
            id={id + '-published'}
            checked={draft.published}
            onCheckedChange={(v) => update('published', v)}
          />
        </div>
      </div>
    </Editor>
  )
}
