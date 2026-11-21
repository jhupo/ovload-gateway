import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { authSettingsApi, type AuthSettings } from '@/api/auth-settings'
import { ApiError } from '@/api/errors'
import { parseEmailWhitelist } from './login'
import { authSettingsErrors } from './validation'

export function useAuthSettings(canManage: boolean) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [emailWhitelist, setEmailWhitelist] = useState('')
  const [snapshot, setSnapshot] = useState<AuthSettings | null>(null)
  const [draft, setDraft] = useState<AuthSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)
  const [validated, setValidated] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const validation =
    validated && draft ? authSettingsErrors(draft, emailWhitelist) : {}
  const errors = Object.fromEntries(
    Object.entries(validation).map(([key, error]) => [
      key,
      t('generalSettings.' + error),
    ])
  )
  const request = useRef<AbortController | null>(null)
  const loaded = useRef(false)
  const dirty =
    JSON.stringify(snapshot) !== JSON.stringify(draft) ||
    emailWhitelist !== (snapshot?.allowed_domains.join('\n') ?? '')
  async function load() {
    if (!canManage || request.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    try {
      const value = await authSettingsApi.load(controller.signal)
      if (controller.signal.aborted) return
      setSnapshot(value)
      loaded.current = true
      setEmailWhitelist(value.allowed_domains.join('\n'))
      setDraft(value)
      setLoadFailed(false)
      setIssue(null)
      setValidated(false)
    } catch (e) {
      if (!controller.signal.aborted) {
        setLoadFailed(true)
        toast.error(e instanceof Error ? e.message : t('auth.error'))
      }
    } finally {
      setLoading(false)
      if (request.current === controller) request.current = null
    }
  }
  useEffect(() => {
    let disposed = false
    queueMicrotask(() => {
      if (!disposed && !loaded.current) void load()
    })
    return () => {
      disposed = true
      request.current?.abort()
      request.current = null
    }
  }, [canManage]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (
      !draft ||
      !dirty ||
      !canManage ||
      request.current ||
      issue ||
      loadFailed
    )
      return
    setValidated(true)
    const invalid = authSettingsErrors(draft, emailWhitelist)
    if (Object.keys(invalid).length) {
      toast.error(t('generalSettings.' + Object.values(invalid)[0]), {
        id: 'auth-settings-validation',
      })
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    const domains = parseEmailWhitelist(emailWhitelist)!
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    try {
      const value = await authSettingsApi.update(
        { ...draft, allowed_domains: domains.sort() },
        controller.signal
      )
      if (controller.signal.aborted) return
      setSnapshot(value)
      setDraft(value)
      setEmailWhitelist(value.allowed_domains.join('\n'))
      setValidated(false)
      await client.invalidateQueries({ queryKey: ['registration-policy'] })
      toast.success(t('generalSettings.saved'))
    } catch (e) {
      if (!controller.signal.aborted) {
        if (e instanceof ApiError && e.status === 409) setIssue('conflict')
        else if (!(e instanceof ApiError) || e.status >= 500) {
          try {
            const current = await authSettingsApi.load(controller.signal)
            if (controller.signal.aborted) return
            if (current.revision !== draft.revision) setIssue('conflict')
          } catch {
            if (!controller.signal.aborted) setIssue('saveUnconfirmed')
          }
        }
        toast.error(e instanceof Error ? e.message : t('auth.error'), {
          id: 'auth-settings-save',
        })
      }
    } finally {
      setPending(false)
      if (request.current === controller) request.current = null
    }
  }
  return {
    draft,
    setDraft,
    emailWhitelist,
    setEmailWhitelist,
    dirty,
    loading,
    pending,
    loadFailed,
    issue,
    errors,
    formRef,
    ready: !!snapshot,
    readingLogo: false,
    load,
    save,
    reset: () => {
      if (!request.current) {
        if (issue) {
          void load()
          return
        }
        setDraft(snapshot)
        setEmailWhitelist(snapshot?.allowed_domains.join('\n') ?? '')
        setValidated(false)
      }
    },
  }
}
