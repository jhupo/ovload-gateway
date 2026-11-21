import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GroupPricing } from '@/api/account-groups'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const defaults = {
  timezone: 'Asia/Shanghai',
  startMinute: 540,
  endMinute: 1080,
  peakMultiplierBps: 10000,
  offPeakMultiplierBps: 10000,
}
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
export function GroupBilling({
  value,
  onChange,
}: {
  value: GroupPricing['peak']
  onChange: (value: GroupPricing['peak']) => void
}) {
  const { t } = useTranslation()
  const open = value !== null
  const settings = value ?? defaults
  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <Label id='group-peak-label'>{t('groups.peak_billing')}</Label>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-expanded={open}
            aria-controls='group-peak-fields'
            aria-labelledby='group-peak-label'
            onClick={() => onChange(open ? null : settings)}
          >
            {open ? (
              <ChevronUp className='size-4' />
            ) : (
              <ChevronDown className='size-4' />
            )}
          </Button>
        </div>
      </div>
      {open && (
        <fieldset
          id='group-peak-fields'
          disabled={!value}
          className='grid gap-4 sm:grid-cols-2'
        >
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='group-timezone'>{t('groups.timezone')}</Label>
            <Select
              value={settings.timezone}
              onValueChange={(timezone) => onChange({ ...settings, timezone })}
              disabled={!value}
            >
              <SelectTrigger id='group-timezone' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ...new Set([
                    settings.timezone,
                    'Asia/Shanghai',
                    'Asia/Tokyo',
                    'Asia/Singapore',
                    'UTC',
                    'America/New_York',
                    'America/Chicago',
                    'America/Los_Angeles',
                    'Europe/London',
                    'Europe/Berlin',
                  ]),
                ].map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(['startMinute', 'endMinute'] as const).map((key) => (
            <div key={key} className='space-y-2'>
              <Label htmlFor={`group-${key}`}>
                {t(
                  `groups.${key === 'startMinute' ? 'peak_start' : 'peak_end'}`
                )}
              </Label>
              <Input
                id={`group-${key}`}
                type='time'
                required
                value={time(settings[key])}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  if (Number.isFinite(h + m))
                    onChange({ ...settings, [key]: h * 60 + m })
                }}
              />
            </div>
          ))}
          {(['peakMultiplierBps', 'offPeakMultiplierBps'] as const).map(
            (key) => (
              <div key={key} className='space-y-2'>
                <Label htmlFor={`group-${key}`}>
                  {t(
                    `groups.${key === 'peakMultiplierBps' ? 'peak_rate' : 'off_peak_rate'}`
                  )}
                </Label>
                <Input
                  id={`group-${key}`}
                  type='number'
                  min={0}
                  max={100}
                  step='0.0001'
                  value={settings[key] / 10000}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      [key]: Math.round(Number(e.target.value) * 10000),
                    })
                  }
                />
              </div>
            )
          )}
        </fieldset>
      )}
    </section>
  )
}
