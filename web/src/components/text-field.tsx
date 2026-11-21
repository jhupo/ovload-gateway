import { useId, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { FieldLayout } from '@/components/field-layout'

export function TextField({
  label,
  error,
  ...props
}: Omit<ComponentProps<typeof Input>, 'id'> & {
  label: string
  error?: string
}) {
  const id = useId()
  return (
    <FieldLayout id={id} label={label} error={error}>
      <Input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? id + '-error' : undefined}
      />
    </FieldLayout>
  )
}
