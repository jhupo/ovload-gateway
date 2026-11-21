import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Content-sized label tracks keep values at the same start across table rows. */
export function MetricList({
  stacked = false,
  className,
  ...props
}: ComponentProps<'dl'> & { stacked?: boolean }) {
  return (
    <dl
      {...props}
      data-slot='metric-list'
      data-stacked={stacked || undefined}
      className={cn(
        'w-full text-left text-xs tabular-nums [&_dd]:text-left [&_dt]:text-left',
        stacked
          ? 'space-y-2'
          : 'grid grid-cols-[max-content_max-content] items-baseline justify-start gap-x-2 gap-y-1',
        className
      )}
    />
  )
}
