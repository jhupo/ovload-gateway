import { type ComponentProps } from 'react'
import { Moon, Sun } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ThemeToggleIconButtonProps = Omit<
  ComponentProps<typeof Button>,
  'onClick'
> & {
  isDark: boolean
  onToggle: () => void
  label: string
}

export function ThemeToggleIconButton({
  isDark,
  onToggle,
  label,
  className,
  ...props
}: ThemeToggleIconButtonProps) {
  const reduced = useReducedMotion()
  const transition = reduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 220, damping: 15 }

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      aria-label={label}
      aria-pressed={isDark}
      className={cn('rounded-full', className)}
      onClick={onToggle}
      {...props}
    >
      <span className='relative size-[1.15rem]' aria-hidden='true'>
        <motion.span
          className='absolute inset-0'
          animate={{
            opacity: isDark ? 0 : 1,
            rotate: isDark ? -90 : 0,
            scale: isDark ? 0.5 : 1,
          }}
          initial={false}
          transition={transition}
        >
          <Sun className='size-full' />
        </motion.span>
        <motion.span
          className='absolute inset-0'
          animate={{
            opacity: isDark ? 1 : 0,
            rotate: isDark ? 0 : 90,
            scale: isDark ? 1 : 0.5,
          }}
          initial={false}
          transition={transition}
        >
          <Moon className='size-full' />
        </motion.span>
      </span>
    </Button>
  )
}
