import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { MonthAndYearCalendar } from '@/components/shadcn-space/calendar/calendar-05'

export function OrderShell({
  title,
  actions,
  children,
  fixed = false,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  fixed?: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main fixed={fixed} id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 flex-wrap items-center justify-between gap-3'
        >
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t(title)}
            </h1>
          </div>
          {actions}
        </div>
        {children}
      </Main>
    </>
  )
}
export function OrderDate({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          className='h-8 min-w-0 justify-between font-normal'
          aria-label={label}
        >
          {value || label}
          <CalendarDays className='size-4' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <MonthAndYearCalendar
          mode='single'
          selected={value ? new Date(value + 'T12:00:00') : undefined}
          defaultMonth={value ? new Date(value + 'T12:00:00') : undefined}
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2100, 11)}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
