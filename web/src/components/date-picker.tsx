import { Calendar as CalendarIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { MonthAndYearCalendar } from '@/components/shadcn-space/calendar/calendar-05'

type DatePickerProps = {
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  label?: string
}

export function DatePicker({
  selected,
  onSelect,
  placeholder,
  label,
}: DatePickerProps) {
  const { t, i18n } = useTranslation()
  const displayPlaceholder = placeholder || t('common.pick_date')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          aria-label={label}
          data-empty={!selected}
          className='w-60 justify-start text-start font-normal data-[empty=true]:text-muted-foreground'
        >
          {selected ? (
            new Intl.DateTimeFormat(i18n.language).format(selected)
          ) : (
            <span>{displayPlaceholder}</span>
          )}
          <CalendarIcon className='ms-auto h-4 w-4 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0'>
        <MonthAndYearCalendar
          startMonth={new Date(1900, 0)}
          endMonth={new Date()}
          mode='single'
          captionLayout='dropdown'
          selected={selected}
          onSelect={onSelect}
          disabled={(date: Date) =>
            date > new Date() || date < new Date('1900-01-01')
          }
        />
      </PopoverContent>
    </Popover>
  )
}
