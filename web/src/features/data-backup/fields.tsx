import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { FieldLayout } from '@/components/field-layout'

export function BackupField({
  label,
  ...props
}: ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <FieldLayout id={props.id} label={label}>
      <Input
        autoComplete={props.type === 'password' ? 'new-password' : 'off'}
        {...props}
      />
    </FieldLayout>
  )
}
