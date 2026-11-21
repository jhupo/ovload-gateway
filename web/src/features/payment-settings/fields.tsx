import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'

export function PaymentField({
  name,
  label,
  value,
  onChange,
  error,
  numeric,
  maxLength = 500,
  multiline = false,
  placeholder,
}: {
  name: string
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string
  numeric?: boolean
  maxLength?: number
  multiline?: boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const text = label ?? t('paymentSettings.' + name)
  const props = {
    id,
    name,
    value,
    placeholder,
    maxLength,
    autoComplete: 'off',
    spellCheck: false,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => onChange(event.target.value),
    'aria-invalid': !!error,
    'aria-describedby': error ? id + '-error' : undefined,
  }
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{text}</Label>
      {multiline ? (
        <Textarea {...props} rows={4} />
      ) : (
        <Input {...props} inputMode={numeric ? 'decimal' : undefined} />
      )}
      {error && (
        <span id={id + '-error'} className='sr-only'>
          {t('paymentSettings.' + error, { field: text })}
        </span>
      )}
    </div>
  )
}
export function PaymentSelect({
  name,
  value,
  options,
  onChange,
}: {
  name: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{t('paymentSettings.' + name)}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className='w-full'
          aria-label={t('paymentSettings.' + name)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {t('paymentSettings.options.' + option, { defaultValue: option })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
export function PaymentToggle({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className='flex min-h-9 items-center justify-between gap-4'>
      <span className='text-sm font-medium'>
        {t('paymentSettings.' + name)}
      </span>
      <SwitchLabeled
        size='sm'
        containedMotion
        checked={value}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={t('paymentSettings.' + name)}
      />
    </div>
  )
}
