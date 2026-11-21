import { useId, useState, type ComponentProps } from 'react'
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FloatingLabelFieldProps = ComponentProps<typeof Input> & {
  label: string
  icon: LucideIcon
}

export function FloatingLabelField({
  label,
  icon: Icon,
  className,
  type,
  id,
  ...props
}: FloatingLabelFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [revealed, setRevealed] = useState(false)
  const { t } = useTranslation()
  const invalid =
    props['aria-invalid'] === true || props['aria-invalid'] === 'true'
  return (
    <div
      className={cn(
        'floating-field flex items-end gap-3 pb-2 text-muted-foreground',
        className
      )}
      data-invalid={invalid}
    >
      <Icon className='mb-1 size-4 shrink-0' aria-hidden='true' />
      <div className='relative min-w-0 flex-1'>
        <Input
          {...props}
          id={inputId}
          type={type === 'password' && revealed ? 'text' : type}
          placeholder=' '
          className='floating-input h-12 rounded-none border-0 bg-transparent! px-0 pe-9 pt-5 pb-0 text-base text-foreground shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:aria-invalid:ring-0'
        />
        <Label
          htmlFor={inputId}
          className='absolute start-0 top-6 origin-left text-sm font-normal text-current transition-[transform,color] duration-200'
        >
          {label}
        </Label>
      </div>
      {type === 'password' && (
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={props.disabled}
          aria-label={t(
            revealed ? 'common.hide_password' : 'common.show_password'
          )}
          aria-pressed={revealed}
          className='absolute end-0 bottom-1 rounded-full text-current'
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? (
            <Eye className='size-4' />
          ) : (
            <EyeOff className='size-4' />
          )}
        </Button>
      )}
    </div>
  )
}
