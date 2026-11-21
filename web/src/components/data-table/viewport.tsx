import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function TableViewport({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border [&>[data-slot=table-container]]:overflow-visible',
        className
      )}
    />
  )
}
