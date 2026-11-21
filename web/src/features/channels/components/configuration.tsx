import { useId, type ComponentProps } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ConfigurationInput({
  label,
  unit,
  ...props
}: ComponentProps<typeof Input> & { label: string; unit?: string }) {
  const id = useId()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id} className='min-h-4 text-xs text-muted-foreground'>
        {label}
      </Label>
      <div className='flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/50'>
        <Input
          {...props}
          id={id}
          className='min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent'
        />
        {unit && (
          <span className='shrink-0 pr-3 text-xs text-muted-foreground'>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

export function ConfigurationSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id} className='text-xs text-muted-foreground'>
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className='w-full min-w-0'>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function CheckboxCollection({
  title,
  options,
  selected,
  onChange,
  search,
  onSearch,
  countLabel,
}: {
  title: string
  options: { id: string; label: string; detail?: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  search?: string
  onSearch?: (value: string) => void
  countLabel?: string
}) {
  const { t } = useTranslation()
  const filtered = options.filter((item) =>
    (item.label + ' ' + (item.detail ?? ''))
      .toLowerCase()
      .includes((search ?? '').toLowerCase())
  )
  const allChecked =
    filtered.length > 0 && filtered.every((item) => selected.includes(item.id))
  return (
    <div className='space-y-3' role='group' aria-label={title}>
      <div className='flex flex-wrap items-center gap-2'>
        {onSearch && (
          <div className='relative min-w-32 flex-1'>
            <Search
              aria-hidden
              className='absolute top-2.5 left-3 size-4 text-muted-foreground'
            />
            <Input
              aria-label={t('channelConfig.search', { name: title })}
              placeholder={t('common.search')}
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              className='pl-9'
            />
          </div>
        )}
        <Badge variant='secondary' className='font-normal tabular-nums'>
          {countLabel ??
            t('channelConfig.selected', { count: selected.length })}
        </Badge>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          disabled={!filtered.length}
          onClick={() =>
            onChange(
              allChecked
                ? selected.filter(
                    (id) => !filtered.some((item) => item.id === id)
                  )
                : [
                    ...new Set([
                      ...selected,
                      ...filtered.map((item) => item.id),
                    ]),
                  ]
            )
          }
        >
          {t(allChecked ? 'channelConfig.clear' : 'channelConfig.selectAll')}
        </Button>
      </div>
      <div
        className='max-h-64 overflow-y-auto rounded-md border p-1'
        tabIndex={0}
        aria-label={title}
      >
        <div className='grid sm:grid-cols-2'>
          {filtered.map((item) => (
            <label
              key={item.id}
              className='flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50'
            >
              <Checkbox
                checked={selected.includes(item.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...new Set([...selected, item.id])]
                      : selected.filter((id) => id !== item.id)
                  )
                }
              />
              <span className='min-w-0 flex-1 text-sm'>
                <span className='block truncate'>{item.label}</span>
                {item.detail && (
                  <span className='block truncate text-[11px] text-muted-foreground'>
                    {item.detail}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {!filtered.length && (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {t('common.no_data')}
          </p>
        )}
      </div>
    </div>
  )
}
