import { useId, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/** Request failures are transient notifications, not form content. */
export function RequestErrorToast({
  message,
  retry,
}: {
  message?: string | null
  retry?: () => void
}) {
  const id = useId()
  const { t } = useTranslation()
  const action = useRef(retry)
  useEffect(() => {
    action.current = retry
  }, [retry])
  const text =
    message &&
    /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(
      message
    )
      ? t('identity.errors.unavailable')
      : message
  const retryLabel = retry ? t('identity.retry') : undefined
  useEffect(() => {
    if (!text) return
    const frame = requestAnimationFrame(() =>
      toast.error(text, {
        id,
        action: retryLabel
          ? { label: retryLabel, onClick: () => action.current?.() }
          : undefined,
      })
    )
    return () => {
      cancelAnimationFrame(frame)
      toast.dismiss(id)
    }
  }, [id, text, retryLabel])
  return null
}
