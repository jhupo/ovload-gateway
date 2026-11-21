import { CircleOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function UnavailableSection() {
  const { t } = useTranslation()
  return (
    <div
      role='status'
      className='flex items-center gap-2 text-sm text-muted-foreground'
    >
      <CircleOff className='size-4 shrink-0' aria-hidden='true' />
      <span>{t('featureAvailability.unavailable')}</span>
    </div>
  )
}
