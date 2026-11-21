import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/** For validation derived from filter state rather than an explicit submit. */
export function useErrorToast(message: string | undefined, id: string) {
  const { t } = useTranslation()
  const text =
    message &&
    /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(
      message
    )
      ? t('identity.errors.unavailable')
      : message
  useEffect(() => {
    if (!text) {
      toast.dismiss(id)
      return
    }
    // Sonner schedules dismissal on a frame; publish after pending dismissals.
    const frame = requestAnimationFrame(() => toast.error(text, { id }))
    return () => cancelAnimationFrame(frame)
  }, [text, id])
  useEffect(
    () => () => {
      toast.dismiss(id)
    },
    [id]
  )
}
