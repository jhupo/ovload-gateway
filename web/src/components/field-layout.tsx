import { type ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export function FieldLayout({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <span id={`${id}-error`} className='sr-only'>
          {error}
        </span>
      )}
    </div>
  )
}
