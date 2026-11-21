import { useState, type ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MetricList } from '@/components/data-table/metric-list'

export function MetricRows({
  entries,
  className,
}: {
  entries: [label: string, value: string, tone?: string][]
  className?: string
}) {
  return (
    <MetricList className={className}>
      {entries.map(([label, value, tone = '']) => (
        <div key={label} className='contents'>
          <dt className='opacity-70'>{label}</dt>
          <dd className={`text-left font-medium whitespace-nowrap ${tone}`}>
            {value}
          </dd>
        </div>
      ))}
    </MetricList>
  )
}

export function MetricPreview({
  label,
  children,
  details,
}: {
  label: string
  children: ReactNode
  details: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label={label}
          className='cursor-help rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          onClick={(event) => {
            // Radix closes tooltips on click by default; keep tap previews open.
            event.preventDefault()
            setOpen(true)
          }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent
        sideOffset={6}
        className='max-w-[calc(100vw-2rem)] border bg-popover p-2.5 text-left text-wrap text-popover-foreground shadow-md [&_svg]:bg-popover [&_svg]:fill-popover'
      >
        <p className='mb-1.5 font-semibold'>{label}</p>
        {details}
      </TooltipContent>
    </Tooltip>
  )
}
