// Adapted from Shadcn Space calendar-05. See THIRD_PARTY_NOTICES.md.
import { type ChangeEvent, type ComponentProps } from 'react'
import { type DropdownProps, type DropdownNavProps } from 'react-day-picker'
import { enUS, zhCN } from 'react-day-picker/locale'
import { useTranslation } from 'react-i18next'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function CalendarDropdown(props: DropdownProps) {
  return (
    <Select
      value={String(props.value)}
      disabled={props.disabled}
      onValueChange={(value) =>
        props.onChange?.({
          target: { value },
        } as ChangeEvent<HTMLSelectElement>)
      }
    >
      <SelectTrigger
        className='h-8 min-w-0 flex-1'
        aria-label={props['aria-label']}
      >
        <SelectValue>
          {
            props.options?.find(
              (option) => option.value === Number(props.value)
            )?.label
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent position='popper' className='max-h-64' align='start'>
        {props.options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
function DropdownNav({ children }: DropdownNavProps) {
  return <div className='flex w-full items-center gap-2'>{children}</div>
}
export function MonthAndYearCalendar(props: ComponentProps<typeof Calendar>) {
  const { i18n } = useTranslation()
  return (
    <Calendar
      {...props}
      locale={i18n.language.startsWith('zh') ? zhCN : enUS}
      formatters={{
        formatMonthDropdown: (date) =>
          new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(
            date
          ),
      }}
      captionLayout='dropdown'
      hideNavigation
      classNames={{ month_caption: 'mx-0' }}
      components={{ Dropdown: CalendarDropdown, DropdownNav }}
    />
  )
}
