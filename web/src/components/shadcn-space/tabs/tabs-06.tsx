'use client'

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import { type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type VerticalTabsProps = {
  value: string
  onValueChange: (value: string) => void
  label: string
  items: { id: string; label: string; icon: LucideIcon; disabled?: boolean }[]
  children: ReactNode
  fillContent?: boolean
  className?: string
  navigationClassName?: string
}

export default function TabsVertical({
  value,
  onValueChange,
  label,
  items,
  children,
  fillContent = false,
  className,
  navigationClassName,
}: VerticalTabsProps) {
  const id = useId()
  const mobile = useIsMobile()
  const reduced = useReducedMotion()
  const list = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    content.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [value])
  useEffect(() => {
    if (!mobile || !list.current) return
    const active = list.current.querySelector<HTMLElement>(
      '[data-state=active]'
    )
    if (!active) return
    const container = list.current.getBoundingClientRect()
    const tab = active.getBoundingClientRect()
    const offset =
      tab.left < container.left
        ? tab.left - container.left
        : tab.right > container.right
          ? tab.right - container.right
          : 0
    if (offset) list.current.scrollLeft += offset
  }, [value, mobile, items])
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      orientation={mobile ? 'horizontal' : 'vertical'}
      className={cn(
        'flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-hidden md:flex-row md:gap-8',
        className
      )}
    >
      <div
        className={cn(
          'shrink-0 md:w-48 md:self-stretch md:border-r md:border-border md:pr-4',
          navigationClassName
        )}
      >
        <TabsList
          ref={list}
          aria-label={label}
          className='h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 pb-2 md:flex-col md:gap-2 md:overflow-visible md:pb-0'
        >
          {items.map((tab) => {
            const Icon = tab.icon
            const active = value === tab.id
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                disabled={tab.disabled}
                className={cn(
                  'relative w-auto flex-none cursor-pointer justify-start gap-1.5 rounded-lg border border-dashed bg-transparent px-2 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/50 hover:text-foreground data-active:border-transparent data-active:bg-transparent data-active:text-primary data-active:shadow-none md:w-full md:gap-3 md:px-4 md:text-sm dark:data-active:border-transparent dark:data-active:bg-transparent',
                  active && 'text-primary'
                )}
              >
                <Icon aria-hidden='true' className='z-10 size-4' />
                <span className='z-10'>{tab.label}</span>
                {active && (
                  <motion.div
                    data-slot='tabs-active-background'
                    layoutId={id + '-bg'}
                    className='absolute inset-0 rounded-lg bg-primary/10'
                    initial={false}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 300, damping: 25 }
                    }
                  />
                )}
                {active && (
                  <motion.div
                    data-slot='tabs-active-indicator'
                    layoutId={id + '-indicator'}
                    className='absolute top-1/4 bottom-1/4 left-0 hidden w-1 rounded-r-full bg-primary md:block'
                    initial={false}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 300, damping: 25 }
                    }
                  />
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>
      <div
        ref={content}
        data-slot='settings-content'
        className={cn(
          'min-h-0 min-w-0 flex-1 overscroll-contain pe-2',
          fillContent
            ? 'flex flex-col overflow-hidden'
            : 'overflow-y-auto pb-24 [scrollbar-gutter:stable] md:pb-6'
        )}
      >
        {items.map((tab) => (
          <TabsContent
            key={tab.id}
            value={tab.id}
            className={cn(
              'm-0 outline-none',
              fillContent && 'min-h-0 flex-1 flex-col data-[state=active]:flex'
            )}
          >
            {value === tab.id ? children : null}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
