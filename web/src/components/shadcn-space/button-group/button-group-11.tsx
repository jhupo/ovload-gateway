import { MessageSquare, SquareCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'

type ConfirmationMode = 'modal' | 'checkbox'

// Adapted from Shadcn Space button-group-11; attribution in THIRD_PARTY_NOTICES.md.
export default function ConfirmationButtonGroup({
  value,
  onValueChange,
  label,
  modalLabel,
  checkboxLabel,
}: {
  value: ConfirmationMode
  onValueChange: (value: ConfirmationMode) => void
  label: string
  modalLabel: string
  checkboxLabel: string
}) {
  const reduced = useReducedMotion()
  return (
    <div className='relative isolate overflow-hidden rounded-md'>
      <motion.span
        aria-hidden='true'
        className='pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-md bg-primary'
        initial={false}
        animate={{ x: value === 'modal' ? '0%' : '100%' }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: 'spring', stiffness: 350, damping: 28 }
        }
      />
      <ButtonGroup aria-label={label}>
        {(
          [
            { value: 'modal', label: modalLabel, icon: MessageSquare },
            { value: 'checkbox', label: checkboxLabel, icon: SquareCheck },
          ] as const
        ).map((option) => {
          const active = value === option.value
          const Icon = option.icon
          return (
            <Button
              key={option.value}
              type='button'
              variant='outline'
              aria-pressed={active}
              className={cn(
                'relative h-8 min-w-28 rounded-md bg-transparent px-3 transition-colors duration-200 hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent',
                active
                  ? 'border-primary text-primary-foreground hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => onValueChange(option.value)}
            >
              <span className='relative z-10 flex items-center gap-1.5'>
                <motion.span
                  className='inline-flex'
                  animate={{ scale: active && !reduced ? 1.08 : 1 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <Icon aria-hidden='true' className='size-4' />
                </motion.span>
                {option.label}
              </span>
            </Button>
          )
        })}
      </ButtonGroup>
    </div>
  )
}
