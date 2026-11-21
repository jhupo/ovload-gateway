import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { schedulingWeightNames } from '@/api/gateway-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfigurationSection } from '@/components/configuration-section'
import {
  numericFields,
  type GatewayDraft,
  type GatewayErrors,
  type NumericField,
} from './draft'
import { GatewayField, GatewaySelect } from './fields'

export function SchedulingSettings({
  draft,
  errors,
  update,
  disabled,
}: {
  draft: GatewayDraft | null
  errors: GatewayErrors
  update: <K extends keyof GatewayDraft>(key: K, value: GatewayDraft[K]) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('realGatewaySettings.' + key)
  const numbers = (keys: NumericField[]) =>
    keys.map((name) => (
      <GatewayField
        key={name}
        name={name}
        namespace='realGatewaySettings'
        value={draft?.[name] ?? ''}
        type='number'
        min={numericFields[name].min}
        max={numericFields[name].max}
        disabled={disabled}
        error={errors[name]}
        onChange={(value) => update(name, value)}
      />
    ))
  return (
    <>
      <ConfigurationSection title={tr('selection')}>
        <div className='grid min-w-0 grid-cols-1 gap-4 @xl/gateway:grid-cols-2'>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='scheduling-rotation'>
              {tr('rotationStrategy')}
            </Label>
            <GatewaySelect
              name='rotationStrategy'
              id='scheduling-rotation'
              namespace='realGatewaySettings'
              value={draft?.rotationStrategy ?? ''}
              options={[
                'smart',
                'quota_reset_priority',
                'round_robin',
                'sticky',
              ]}
              disabled={disabled}
              onChange={(value) =>
                update(
                  'rotationStrategy',
                  value as GatewayDraft['rotationStrategy']
                )
              }
            />
          </div>
          {numbers(['maxAccountRotations'])}
        </div>
      </ConfigurationSection>
      <ConfigurationSection
        title={tr('weights')}
        action={
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled || !draft?.smartSchedulingDefaults}
            onClick={() => {
              if (draft?.smartSchedulingDefaults)
                update('smartScheduling', { ...draft.smartSchedulingDefaults })
            }}
          >
            <RotateCcw className='size-4' />
            {tr('restoreWeights')}
          </Button>
        }
      >
        <div className='grid min-w-0 grid-cols-1 gap-4 @xl/gateway:grid-cols-2 @3xl/gateway:grid-cols-3'>
          {schedulingWeightNames.map((name) => {
            const value = draft?.smartScheduling[name]
            return (
              <div key={name} className='min-w-0 space-y-2'>
                <Label htmlFor={'scheduling-' + name}>{tr(name)}</Label>
                <Input
                  id={'scheduling-' + name}
                  name={name}
                  type='number'
                  min={0}
                  max={10}
                  step={0.1}
                  inputMode='decimal'
                  disabled={disabled}
                  value={
                    value === undefined || Number.isNaN(value) ? '' : value
                  }
                  aria-invalid={!!errors.smartScheduling}
                  aria-describedby={
                    errors.smartScheduling ? 'scheduling-error' : undefined
                  }
                  onChange={(event) => {
                    if (draft)
                      update('smartScheduling', {
                        ...draft.smartScheduling,
                        [name]: event.target.valueAsNumber,
                      })
                  }}
                />
              </div>
            )
          })}
        </div>
        {errors.smartScheduling && (
          <p
            id='scheduling-error'
            role='alert'
            className='text-sm text-destructive'
          >
            {tr(errors.smartScheduling)}
          </p>
        )}
      </ConfigurationSection>
    </>
  )
}
