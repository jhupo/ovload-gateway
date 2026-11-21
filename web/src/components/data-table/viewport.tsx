import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function TableViewport({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'min-h-0 min-w-0 flex-1 overscroll-contain overflow-auto rounded-lg border [scrollbar-gutter:stable_both-edges] [&_[data-slot=table-container]]:overflow-visible',
        className
      )}
    />
  )
}
