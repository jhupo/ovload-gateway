import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import {
  siteSettingsApi,
  type SiteSettings,
  type SiteSettingsInput,
} from '@/api/site-settings'
import { useIdentitySession } from '@/stores/identity-session'
import { publishSiteIdentity } from '@/hooks/use-site-identity'
import { siteErrors, siteFields } from './validation'

const empty: SiteSettingsInput = {
  name: '',
  subtitle: '',
  support: '',
  endpoint: '',
}

export function useSiteSettings(canManage: boolean) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const sessionId = useIdentitySession((state) => state.session?.id)
  const [snapshot, setSnapshot] = useState<SiteSettings | null>(null)
  const [draft, setDraft] = useState(empty)
  const [logoChange, setLogoChange] = useState<File | null | undefined>()
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(canManage)
  const [pending, setPending] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [issue, setIssue] = useState<'conflict' | 'saveUnconfirmed' | null>(
    null
  )
  const [errors, setErrors] = useState<
    Partial<Record<keyof SiteSettingsInput | 'logo', string>>
  >({})
  const request = useRef<AbortController | null>(null)
  const previewUrl = useRef<string | null>(null)
  const selection = useRef(0)
  const selecting = useRef(false)
  const [readingLogo, setReadingLogo] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty =
    !!snapshot &&
    (JSON.stringify(siteFields(snapshot)) !== JSON.stringify(draft) ||
      logoChange !== undefined)

  const cancelSelection = useCallback(() => {
    selection.current++
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
  }, [])

  const clearLogo = useCallback(() => {
    cancelSelection()
    selecting.current = false
    setReadingLogo(false)
    setPreview(null)
    setLogoChange(undefined)
  }, [cancelSelection])

  const apply = useCallback(
    (value: SiteSettings) => {
      publishSiteIdentity(queryClient, value)
      setSnapshot(value)
      setDraft(siteFields(value))
      clearLogo()
      setErrors({})
      setIssue(null)
    },
    [clearLogo, queryClient]
  )

  const load = useCallback(async () => {
    if (!canManage || request.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setLoadFailed(false)
    try {
      const result = await siteSettingsApi.load(controller.signal)
      if (
        !controller.signal.aborted &&
        useIdentitySession.getState().session?.id === sessionId
      )
        apply(result)
    } catch {
      if (!controller.signal.aborted) {
        setLoadFailed(true)
        toast.error(t('auth.error'), { id: 'site-settings-load' })
      }
    } finally {
      setLoading(false)
      if (request.current === controller) request.current = null
    }
  }, [apply, canManage, sessionId, t])

  useEffect(() => {
    const controller = new AbortController()
    if (canManage) {
      request.current = controller
      void siteSettingsApi
        .load(controller.signal)
        .then((result) => {
          if (
            !controller.signal.aborted &&
            useIdentitySession.getState().session?.id === sessionId
          )
            apply(result)
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLoadFailed(true)
            toast.error(t('auth.error'), {
              id: 'site-settings-load',
            })
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
          if (request.current === controller) request.current = null
        })
    }
    return () => {
      request.current?.abort()
      request.current = null
      cancelSelection()
    }
  }, [canManage, sessionId, apply, cancelSelection, t])

  function reset() {
    if (issue) {
      clearLogo()
      setErrors({})
      void load()
      return
    }
    if (snapshot) setDraft(siteFields(snapshot))
    clearLogo()
    setErrors({})
  }

  async function selectLogo(file?: File) {
    if (!file || pending || loading || issue || !snapshot) return
    const current = ++selection.current
    selecting.current = true
    setReadingLogo(true)
    try {
      if (
        !['image/png', 'image/jpeg'].includes(file.type) ||
        !file.size ||
        file.size > 300 * 1024
      )
        throw new Error('Invalid logo')
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
      const valid =
        file.type === 'image/png'
          ? [137, 80, 78, 71, 13, 10, 26, 10].every(
              (byte, index) => bytes[index] === byte
            )
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      if (!valid) throw new Error('Invalid logo')
      if (current !== selection.current) return
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      const url = URL.createObjectURL(file)
      previewUrl.current = url
      setPreview(url)
      setLogoChange(file)
      setErrors((previous) => ({ ...previous, logo: undefined }))
    } catch {
      if (current !== selection.current) return
      setErrors((previous) => ({ ...previous, logo: 'logoError' }))
      toast.error(t('generalSettings.logoError'), {
        id: 'site-settings-validation',
      })
      formRef.current?.querySelector<HTMLButtonElement>('#site-logo')?.focus()
    } finally {
      if (current === selection.current) {
        selecting.current = false
        setReadingLogo(false)
      }
    }
  }

  function removeLogo() {
    clearLogo()
    setLogoChange(snapshot?.logo_url ? null : undefined)
    setErrors((previous) => ({ ...previous, logo: undefined }))
  }

  async function save() {
    if (
      !snapshot ||
      !dirty ||
      !canManage ||
      request.current ||
      selecting.current ||
      issue ||
      loadFailed
    )
      return
    const invalid = siteErrors(draft)
    setErrors(invalid)
    const first = Object.keys(invalid)[0] as keyof SiteSettingsInput | undefined
    if (first) {
      toast.error(t(`generalSettings.${invalid[first]}`), {
        id: 'site-settings-validation',
      })
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
          ?.focus()
      )
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    const active = () =>
      !controller.signal.aborted &&
      useIdentitySession.getState().session?.id === sessionId
    try {
      let current = snapshot
      if (JSON.stringify(siteFields(snapshot)) !== JSON.stringify(draft)) {
        current = await siteSettingsApi.update(
          draft,
          current.revision,
          controller.signal
        )
        if (!active()) return
        // Each confirmed write advances the baseline, even if the next write fails.
        setSnapshot(current)
        publishSiteIdentity(queryClient, current)
      }
      if (logoChange !== undefined) {
        current = await siteSettingsApi.replaceLogo(
          logoChange,
          current.revision,
          controller.signal
        )
        if (!active()) return
      }
      apply(current)
      toast.success(t('generalSettings.saved'))
    } catch (error) {
      if (!active()) return
      if (error instanceof ApiError && error.status === 409) {
        setIssue('conflict')
        toast.error(t('generalSettings.conflict'), { id: 'site-settings-save' })
      } else if (!(error instanceof ApiError) || error.status >= 500) {
        setIssue('saveUnconfirmed')
        toast.error(t('generalSettings.saveUnconfirmed'), {
          id: 'site-settings-save',
        })
      } else toast.error(error.message, { id: 'site-settings-save' })
    } finally {
      if (!controller.signal.aborted) setPending(false)
      if (request.current === controller) request.current = null
    }
  }

  function update(key: keyof SiteSettingsInput, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  return {
    draft,
    errors,
    formRef,
    dirty,
    loading,
    pending,
    loadFailed,
    issue,
    readingLogo,
    ready: !!snapshot,
    logo: logoChange === undefined ? snapshot?.logo_url : preview,
    update,
    selectLogo,
    removeLogo,
    reset,
    save,
  }
}
