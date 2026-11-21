import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsToggle } from '@/components/settings-toggle'
import { TextField } from '@/components/text-field'

const fieldKey = (namespace: string, name: string) =>
  namespace.endsWith(':') ? namespace + name : namespace + '.' + name

export function GatewayField({
  name,
  value,
  onChange,
  error,
  min,
  max,
  type = 'text',
  placeholder,
  disabled = false,
  namespace = 'gatewaySettings',
}: {
  name: string
  value: string
  onChange: (value: string) => void
  error?: string
  min?: number
  max?: number
  type?: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  namespace?: string
}) {
  const { t } = useTranslation()
  return (
    <TextField
      label={t(fieldKey(namespace, name))}
      error={
        error
          ? t(fieldKey(namespace, error), {
              min,
              max,
              field: t(fieldKey(namespace, name)),
            })
          : undefined
      }
      name={name}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      type={type}
      min={min}
      max={max}
      step={type === 'number' ? 1 : undefined}
      inputMode={type === 'number' ? 'numeric' : undefined}
      maxLength={300}
      autoComplete='off'
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function GatewaySelect({
  id,
  name,
  value,
  options,
  onChange,
  disabled = false,
  namespace = 'gatewaySettings',
}: {
  id?: string
  name: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  disabled?: boolean
  namespace?: string
}) {
  const { t } = useTranslation()
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        size='sm'
        className='w-auto min-w-32'
        aria-label={t(fieldKey(namespace, name))}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {t(fieldKey(namespace, 'options.' + option))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function GatewayToggle({
  name,
  value,
  onChange,
  disabled = false,
  namespace = 'gatewaySettings',
}: {
  name: string
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  namespace?: string
}) {
  const { t } = useTranslation()
  return (
    <SettingsToggle
      label={t(fieldKey(namespace, name))}
      checked={value}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  )
}
