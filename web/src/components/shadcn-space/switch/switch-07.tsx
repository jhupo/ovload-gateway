'use client'

import { useState, type ComponentProps } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface SwitchLabeledProps extends Omit<
  ComponentProps<typeof SwitchPrimitive.Root>,
  'onChange'
> {
  size?: 'default' | 'sm'
  containedMotion?: boolean
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  onLabel?: string
  offLabel?: string
  disabled?: boolean
  className?: string
}

const SwitchLabeled = ({
  size = 'sm',
  containedMotion = false,
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  onLabel,
  offLabel,
  disabled,
  className,
  ...props
}: SwitchLabeledProps) => {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  onLabel ??= t('common.switchOn')
  offLabel ??= t('common.switchOff')
  const [uncontrolled, setUncontrolled] = useState(defaultChecked)
  const checked = checkedProp ?? uncontrolled
  const longestLabel = Math.max(onLabel.length, offLabel.length)

  const updateChecked = (next: boolean) => {
    if (checkedProp === undefined) setUncontrolled(next)
    onCheckedChange?.(next)
  }

  return (
    // Radix renders a sibling form input; keep it inside the switch's bounds.
    <span className='relative inline-flex shrink-0'>
      <SwitchPrimitive.Root
        {...props}
        checked={checked}
        disabled={disabled}
        onCheckedChange={updateChecked}
        style={{
          ...props.style,
          width: `calc(${longestLabel}rem + ${size === 'sm' ? 2 : 2.75}rem)`,
        }}
        className={cn(
          'relative flex h-8 shrink-0 items-center rounded-full border border-transparent p-1 transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' && 'h-6',
          checked ? 'bg-primary' : 'bg-input dark:bg-input/80',
          className
        )}
      >
        <div className='absolute inset-0 flex items-center justify-between px-2'>
          <AnimatePresence initial={false}>
            {checked && (
              <motion.span
                key='on'
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: reduced ? 0 : 0.15 }}
                className='text-xs font-medium tracking-wide text-primary-foreground uppercase'
              >
                {onLabel}
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {!checked && (
              <motion.span
                key='off'
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                transition={{ duration: reduced ? 0 : 0.15 }}
                className='ml-auto text-xs font-medium tracking-wide text-foreground uppercase'
              >
                {offLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <SwitchPrimitive.Thumb asChild>
          <motion.span
            layout={!containedMotion && !reduced}
            whileTap={reduced ? undefined : { scale: 0.92 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: 'spring', stiffness: 500, damping: 32 }
            }
            animate={
              containedMotion
                ? {
                    left: checked
                      ? `calc(100% - ${size === 'sm' ? 20 : 28}px)`
                      : '4px',
                  }
                : undefined
            }
            style={
              containedMotion
                ? { position: 'absolute' }
                : { marginLeft: checked ? 'auto' : 0 }
            }
            className={cn(
              'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-background shadow-sm',
              size === 'sm' && 'size-4',
              checked ? 'dark:bg-primary-foreground' : 'dark:bg-foreground'
            )}
          >
            <span className='flex items-center gap-px'>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2.5 w-px rounded-full transition-colors',
                    size === 'sm' && 'h-2',
                    checked
                      ? 'bg-primary'
                      : 'bg-muted-foreground/50 dark:bg-background/50'
                  )}
                />
              ))}
            </span>
          </motion.span>
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
    </span>
  )
}

export { SwitchLabeled }
