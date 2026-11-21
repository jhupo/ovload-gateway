import { useState, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { integrations, type IntegrationDocument } from '@/api/integrations'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { useErrorToast } from './use-error-toast'

export function useIntegrationSettings<T>(
  kind: string,
  fallback: T,
  normalize: (value: T) => T = (v) => v
) {
  const session = useIdentitySession((s) => s.session)
  useIdentitySession((s) => s.grants)
  const client = useQueryClient()
  const key = ['integration-settings', session?.id, kind]
  const permitted =
    session?.audience === 'management' && allows('security.settings.manage')
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => integrations.load<T>(kind, signal),
    select: (doc) => ({ ...doc, values: normalize(doc.values) }),
    enabled: permitted,
    staleTime: Infinity,
    retry: false,
  })
  const [editing, setEditing] = useState<IntegrationDocument<T> | null>(null)
  const [pending, setPending] = useState(false)
  const snapshot = editing ?? query.data
  const saved = query.data?.values ?? fallback
  const draft = snapshot?.values ?? fallback
  useErrorToast(query.error?.message, `integration-${kind}`)
  return {
    draft,
    saved,
    pending,
    hasSecrets: query.data?.hasSecrets ?? {},
    blocked: !permitted || !snapshot || pending,
    setDraft(value: SetStateAction<T>) {
      if (snapshot && !pending)
        setEditing({
          ...snapshot,
          values:
            typeof value === 'function' ? (value as (v: T) => T)(draft) : value,
        })
    },
    reset() {
      setEditing(null)
      void query.refetch()
    },
    async save(values: T, secrets: Record<string, string | null> = {}) {
      if (!snapshot || !permitted || pending)
        throw new Error('Settings are unavailable')
      setPending(true)
      try {
        const result = await integrations.save(
          kind,
          snapshot.revision,
          values,
          secrets
        )
        if (useIdentitySession.getState().session?.id !== session?.id) return
        client.setQueryData(key, result)
        setEditing(null)
      } finally {
        setPending(false)
      }
    },
  }
}
