import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { lotteryFields, type LotteryDraft } from './lottery-draft'

export function LotteryRuleFields({
  value,
  onChange,
  errors,
}: {
  value: LotteryDraft
  onChange: (value: LotteryDraft) => void
  errors: Record<string, string>
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className='space-y-5'>
      <div className='grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2'>
        {lotteryFields.map((field) => {
          const money = field === 'reward' || field === 'minimumRecharge'
          const error = errors[field]
          return (
            <div key={field} className='min-w-0 space-y-2'>
              <Label
                htmlFor={id + field}
                className='text-xs text-muted-foreground'
              >
                {t('lotterySettings.' + field)}
              </Label>
              <Input
                id={id + field}
                name={field}
                type={money ? 'text' : 'number'}
                inputMode={money ? 'decimal' : 'numeric'}
                min={money ? undefined : 1}
                max={
                  money ? undefined : field === 'winnerCount' ? 1000 : 100000
                }
                step={money ? undefined : 1}
                value={value[field]}
                aria-invalid={!!error}
                aria-describedby={error ? id + field + '-error' : undefined}
                onChange={(event) =>
                  onChange({ ...value, [field]: event.target.value })
                }
              />
              {error && (
                <span id={id + field + '-error'} className='sr-only'>
                  {t('lotterySettings.' + error)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className='flex items-center justify-between gap-4 border-t pt-4'>
        <Label htmlFor={id + 'verification'}>
          {t('lotterySettings.humanVerification')}
        </Label>
        <SwitchLabeled
          id={id + 'verification'}
          size='sm'
          containedMotion
          aria-label={t('lotterySettings.humanVerification')}
          checked={value.humanVerification}
          onCheckedChange={(checked) =>
            onChange({ ...value, humanVerification: checked })
          }
        />
      </div>
    </div>
  )
}
