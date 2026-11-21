import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

export function SettingsControlCard({
  title,
  headingLevel = 3,
  wrapControls = false,
  compact = false,
  className,
  children,
}: {
  title: ReactNode
  headingLevel?: 2 | 3
  wrapControls?: boolean
  compact?: boolean
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <Card
      aria-labelledby={id}
      className={cn(
        'flex-row items-center justify-between gap-4 px-4 shadow-sm sm:px-5',
        compact ? 'min-h-11 py-2' : 'min-h-14 py-3',
        wrapControls && 'flex-wrap',
        className
      )}
    >
      <Heading
        id={id}
        className={cn(
          'min-w-0 flex-1 text-sm font-semibold break-words',
          wrapControls && 'flex-none'
        )}
      >
        {title}
      </Heading>
      <div className='ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2'>
        {children}
      </div>
    </Card>
  )
}
