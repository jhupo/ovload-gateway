import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

export function ContentSection({
  title,
  children,
  compactInset = false,
}: {
  title: string
  children: ReactNode
  compactInset?: boolean
}) {
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>{title}</h3>
      </div>
      <Separator className='my-4 flex-none' />
      <div
        className={cn(
          'faded-bottom h-full w-full overflow-y-auto scroll-smooth pe-4 pb-12 motion-reduce:scroll-auto',
          compactInset && 'pe-0'
        )}
      >
        <div
          className={cn(
            '@container/profile relative -mx-1 px-1.5',
            compactInset && 'mx-0 px-1'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
