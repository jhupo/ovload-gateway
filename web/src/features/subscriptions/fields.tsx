import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
  maxLength = 120,
  suffix,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string
  maxLength?: number
  suffix?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='relative'>
        <Input
          id={id}
          name={id}
          type={type}
          disabled={disabled}
          value={value}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? id + '-error' : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn('min-w-0', suffix && 'pr-10')}
        />
        {suffix && (
          <span className='absolute top-2 right-3 text-sm text-muted-foreground'>
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={id + '-error'} role='alert' className='sr-only'>
          {error}
        </p>
      )}
    </div>
  )
}
export function Choice({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  compact?: boolean
}) {
  const id = useId()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className='w-full'>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
export function SearchChoice({
  label,
  value,
  onChange,
  options,
  onSearch,
  footer,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; detail?: string }[]
  onSearch?: (search: string) => void
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [remembered, setRemembered] = useState<(typeof options)[number]>()
  const selected =
    options.find((o) => o.value === value) ??
    (remembered?.value === value ? remembered : undefined)
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-label={label}
            aria-expanded={open}
            className='h-auto min-h-10 w-full justify-between text-left font-normal'
          >
            <span className='min-w-0'>
              <span className='block truncate'>{selected?.label ?? label}</span>
              {selected?.detail && (
                <span className='block truncate text-xs text-muted-foreground'>
                  {selected.detail}
                </span>
              )}
            </span>
            <ChevronsUpDown className='ml-2 shrink-0' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className='w-[var(--radix-popover-trigger-width)] p-0'
          align='start'
        >
          <Command shouldFilter={!onSearch}>
            <CommandInput
              onValueChange={onSearch}
              placeholder={t('subscriptions.search')}
              aria-label={t('subscriptions.search')}
            />
            <CommandList className='max-h-60 overflow-y-auto'>
              <CommandEmpty>{t('common.no_data')}</CommandEmpty>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label + ' ' + (o.detail ?? '')}
                  onSelect={() => {
                    setRemembered(o)
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate'>{o.label}</span>
                    {o.detail && (
                      <span className='block truncate text-xs text-muted-foreground'>
                        {o.detail}
                      </span>
                    )}
                  </span>
                  {o.value === value && <Check />}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          {footer && <div className='p-2'>{footer}</div>}
        </PopoverContent>
      </Popover>
    </div>
  )
}
