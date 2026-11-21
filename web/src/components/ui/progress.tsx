import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const progressTones = {
  default: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-destructive',
} as const

function Progress({
  className,
  value,
  tone = 'default',
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  tone?: keyof typeof progressTones
}) {
  return (
    <ProgressPrimitive.Root
      data-slot='progress'
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot='progress-indicator'
        className={cn(
          'h-full w-full flex-1 transition-transform duration-500 ease-out motion-reduce:transition-none',
          progressTones[tone]
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
