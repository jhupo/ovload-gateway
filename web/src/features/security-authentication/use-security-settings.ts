import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { allows, useIdentitySession } from '@/stores/identity-session'
import type { QuickLoginConfig } from '@/lib/login-providers'

export type SecurityValues = {
  accessTokenMinutes: number
  refreshTokenDays: number
  stepUpVerification: boolean
  humanVerification: boolean
  captchaSiteKey: string
  authRateLimit: number
  invalidAuthThreshold: number
  invalidAuthBlockMinutes: number
  invalidAuthProtection: boolean
  accessBlock: boolean
  identityBindingEnabled: boolean
  pendingIdentityHours: number
  providers: QuickLoginConfig['providers']
}
type Document = {
  revision: number
  values: SecurityValues
  hasSecrets: Record<string, boolean>
}
export function useSecuritySettings() {
  const { t } = useTranslation()
  const owner = useIdentitySession((s) => s.session?.id)
  useIdentitySession((s) => s.grants)
  const canManage = allows('security.settings.manage'),
    client = useQueryClient()
  const query = useQuery({
    queryKey: ['security-settings', owner],
    queryFn: async () =>
      (await apiRequest<Document>('management', '/security-settings')).data,
    enabled: !!owner && canManage,
    retry: false,
    gcTime: 0,
  })
  const [draft, setDraft] = useState<SecurityValues | null>(null),
    [secrets, setSecrets] = useState<Record<string, string>>({}),
    [pending, setPending] = useState(false),
    [key, setKey] = useState('')
  const adminKey = useQuery({
    queryKey: ['administrator-key', owner],
    queryFn: async () =>
      (
        await apiRequest<{ exists: boolean; expiresAt: string | null }>(
          'management',
          '/security-settings/admin-key'
        )
      ).data,
    enabled: !!owner && canManage,
    retry: false,
    gcTime: 0,
  })
  const values = draft ?? query.data?.values
  const dirty = !!draft || Object.values(secrets).some(Boolean)
  function patch(next: Partial<SecurityValues>) {
    if (values) setDraft({ ...values, ...next })
  }
  async function save() {
    if (!values || !query.data || pending || !canManage) return
    const limits = {
      accessTokenMinutes: [0, 43200],
      refreshTokenDays: [1, 365],
      authRateLimit: [1, 10000],
      invalidAuthThreshold: [1, 1000],
      invalidAuthBlockMinutes: [1, 1440],
      pendingIdentityHours: [1, 168],
    } as const
    for (const name of Object.keys(limits) as (keyof typeof limits)[]) {
      const value = values[name],
        range = limits[name]
      if (!Number.isInteger(value) || value < range[0] || value > range[1]) {
        toast.error(`请输入 ${range[0]} 至 ${range[1]} 之间的整数`)
        return
      }
    }
    setPending(true)
    try {
      const result = await apiRequest<Document>(
        'management',
        '/security-settings',
        {
          method: 'PATCH',
          revision: query.data.revision,
          body: { values, secrets },
        }
      )
      if (useIdentitySession.getState().session?.id !== owner) return
      client.setQueryData(['security-settings', owner], result.data)
      setDraft(null)
      setSecrets({})
      toast.success('安全认证设置已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setPending(false)
    }
  }
  async function regenerate() {
    if (pending || !canManage) return
    setPending(true)
    try {
      const r = await apiRequest<{ key: string }>(
        'management',
        '/security-settings/admin-key',
        { method: 'POST' }
      )
      if (useIdentitySession.getState().session?.id === owner) {
        setKey(r.data.key)
        await adminKey.refetch()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败')
    } finally {
      setPending(false)
    }
  }
  async function revokeKey() {
    if (pending || !canManage) return
    setPending(true)
    try {
      await apiRequest('management', '/security-settings/admin-key', {
        method: 'DELETE',
      })
      if (useIdentitySession.getState().session?.id !== owner) return
      setKey('')
      await adminKey.refetch()
      toast.success(t('securityAuthentication.keyDeleted'))
    } catch (error) {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(
          error instanceof Error
            ? error.message
            : t('securityAuthentication.saveError')
        )
    } finally {
      setPending(false)
    }
  }
  return {
    query,
    adminKey,
    values,
    patch,
    secrets,
    setSecret: (name: string, value: string) =>
      setSecrets((s) => ({ ...s, [name]: value })),
    pending,
    dirty,
    save,
    regenerate,
    revokeKey,
    key,
    setKey,
    canManage,
    reset: () => {
      setDraft(null)
      setSecrets({})
    },
  }
}
