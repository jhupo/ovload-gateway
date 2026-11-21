import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'

export function SettingsToggle({
  label,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className='flex min-h-9 items-center justify-between gap-4'>
      <span className='min-w-0 text-sm font-medium'>{label}</span>
      <SwitchLabeled
        size='sm'
        containedMotion
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  )
}
