import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { ConfigurationSection } from '@/components/configuration-section'
import { CodexLocation } from './codex-location'
import { type GatewayDraft, type GatewayErrors } from './draft'
import { GatewayField, GatewayToggle, GatewaySelect } from './fields'

export function CodexSettings({
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
  const { t } = useTranslation('gatewayCodex')
  const grid = 'grid min-w-0 grid-cols-1 gap-4 @xl/gateway:grid-cols-2'
  const field = (
    name:
      | 'accountAutoFreezeThreshold'
      | 'accountAutoFreezeWindowSeconds'
      | 'accountAutoFreezeDurationSeconds'
      | 'accountAutoFreezeProbeModel'
      | 'accountWarmupModel'
      | 'resetCreditLeadMinutes'
      | 'resetCreditMaxWeeklyRemainingPercent',
    min?: number,
    max?: number
  ) => (
    <GatewayField
      name={name}
      namespace='gatewayCodex:'
      value={draft?.[name] ?? ''}
      disabled={disabled}
      error={errors[name]}
      type={min === undefined ? 'text' : 'number'}
      min={min}
      max={max}
      onChange={(value) => update(name, value)}
    />
  )
  return (
    <>
      <ConfigurationSection
        title={t('translation:realGatewaySettings.affinity')}
      >
        <div className='grid min-w-0 grid-cols-1 gap-4 @xl/gateway:grid-cols-3'>
          {(
            [
              'openaiGuardianReservedConcurrency',
              'openaiSessionAffinityTtlHours',
            ] as const
          ).map((name) => (
            <GatewayField
              key={name}
              name={name}
              namespace='realGatewaySettings'
              value={draft?.[name] ?? ''}
              disabled={disabled}
              type='number'
              error={errors[name]}
              onChange={(value) => update(name, value)}
            />
          ))}
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='codex-affinity'>
              {t('translation:realGatewaySettings.openaiAccountAffinity')}
            </Label>
            <GatewaySelect
              id='codex-affinity'
              name='openaiAccountAffinity'
              namespace='realGatewaySettings'
              value={draft?.openaiAccountAffinity ?? ''}
              options={['relaxed', 'preferred', 'strict']}
              disabled={disabled}
              onChange={(value) =>
                update(
                  'openaiAccountAffinity',
                  value as GatewayDraft['openaiAccountAffinity']
                )
              }
            />
          </div>
        </div>
      </ConfigurationSection>
      <ConfigurationSection
        title={t('accountProtection')}
        action={
          <GatewayToggle
            name='accountAutoFreezeEnabled'
            namespace='gatewayCodex:'
            value={draft?.accountAutoFreezeEnabled ?? false}
            disabled={disabled}
            onChange={(value) => update('accountAutoFreezeEnabled', value)}
          />
        }
      >
        <div className={grid}>
          {field('accountAutoFreezeThreshold', 2, 1000)}
          {field('accountAutoFreezeWindowSeconds', 60, 3600)}
          {field('accountAutoFreezeDurationSeconds', 300, 604800)}
        </div>
        <div className={grid}>
          {(
            [
              'accountAutoFreezeProbeEnabled',
              'accountAutoFreezeAdaptiveConcurrency',
            ] as const
          ).map((name) => (
            <GatewayToggle
              key={name}
              name={name}
              namespace='gatewayCodex:'
              value={draft?.[name] ?? false}
              disabled={disabled}
              onChange={(value) => update(name, value)}
            />
          ))}
        </div>
        {field('accountAutoFreezeProbeModel')}
      </ConfigurationSection>
      {draft && (
        <>
          <CodexLocation
            enabled={draft.requestLocationEnabled}
            disabled={disabled}
            onEnabledChange={(value) => update('requestLocationEnabled', value)}
          />
        </>
      )}
    </>
  )
}
