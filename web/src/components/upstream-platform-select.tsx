import type { ComponentProps } from 'react'
import { accountProviders } from '@/lib/upstream-platforms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function UpstreamPlatformSelect({
  value,
  onValueChange,
  disabled,
  options = accountProviders,
  allLabel,
  ...trigger
}: {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  options?: { value: string; label: string }[]
  allLabel?: string
} & Omit<ComponentProps<typeof SelectTrigger>, 'onChange' | 'value'>) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger {...trigger}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value='all'>{allLabel}</SelectItem>}
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
