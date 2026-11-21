import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function ConfigurationSection({
  title,
  action,
  children,
  id,
  description,
  className,
  contentClassName,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  id?: string
  description?: ReactNode
  className?: string
  contentClassName?: string
}) {
  const heading = useId()
  return (
    <Card
      id={id}
      className={cn('min-w-0 gap-0 py-0 shadow-sm', className)}
      aria-labelledby={heading}
    >
      <CardHeader className='flex shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 [.border-b]:pb-3'>
        <div className='min-w-0 space-y-1'>
          <h3 id={heading} className='text-sm font-semibold'>
            {title}
          </h3>
          {description && (
            <div className='text-xs text-muted-foreground'>{description}</div>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent
        className={cn('min-w-0 space-y-4 p-4 sm:p-5', contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  )
}
