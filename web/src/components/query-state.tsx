import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function QueryState({
  error,
  retry,
}: {
  error?: unknown
  retry: () => unknown
}) {
  const { t } = useTranslation()
  return (
    <div
      className='flex min-h-40 flex-1 items-center justify-center'
      role='status'
    >
      {error ? (
        <Button variant='outline' onClick={() => void retry()}>
          <RefreshCw />
          {t('common.retry')}
        </Button>
      ) : (
        <LoaderCircle
          className='size-5 animate-spin text-muted-foreground'
          aria-label={t('common.loading')}
        />
      )}
    </div>
  )
}
