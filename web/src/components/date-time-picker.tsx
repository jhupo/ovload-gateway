import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { CalendarDays, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { MonthAndYearCalendar } from '@/components/shadcn-space/calendar/calendar-05'

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  label: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}
export function DateTimePicker({ id, value, onChange, label, ...aria }: Props) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const parsed = value ? parseISO(value) : undefined
  const date = parsed && isValid(parsed) ? parsed : undefined
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type='button'
            variant='outline'
            {...aria}
            aria-label={label}
            className='min-w-0 flex-1 justify-between px-3 font-normal'
          >
            <span
              className={
                date
                  ? 'truncate tabular-nums'
                  : 'truncate text-muted-foreground'
              }
            >
              {date
                ? new Intl.DateTimeFormat(i18n.language).format(date)
                : t('common.pick_date')}
            </span>
            <CalendarDays
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground'
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='start'
          className='w-auto max-w-[calc(100vw-2rem)] p-0'
        >
          <MonthAndYearCalendar
            mode='single'
            selected={date}
            defaultMonth={date}
            startMonth={new Date(1900, 0)}
            endMonth={new Date(2100, 11)}
            onSelect={(day) => {
              if (day) {
                onChange(
                  `${format(day, 'yyyy-MM-dd')}T${value.split('T')[1] || '00:00'}`
                )
                setOpen(false)
              }
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        type='time'
        step={60}
        aria-label={`${label} · ${t('datePicker.time')}`}
        disabled={!date}
        value={date ? value.split('T')[1]?.slice(0, 5) || '00:00' : ''}
        onChange={(event) => {
          if (date && event.target.value)
            onChange(`${value.split('T')[0]}T${event.target.value}`)
        }}
        className='w-[6.5rem] shrink-0 px-2 tabular-nums'
        {...aria}
      />
      {value && (
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          aria-label={`${t('datePicker.clear')} · ${label}`}
          onClick={() => onChange('')}
        >
          <X className='size-3.5' />
        </Button>
      )}
    </div>
  )
}
