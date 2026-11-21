import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  workspaceSettingsApi,
  type SettingsDocument,
  type SettingsKind,
} from '@/api/workspace-settings'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { useErrorToast } from './use-error-toast'

export const visibilityKey = ['workspace-visibility'] as const

export function useWorkspaceVisibility() {
  return useQuery({
    queryKey: visibilityKey,
    queryFn: ({ signal }) => workspaceSettingsApi.visibility(signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useWorkspaceSettings<T>(kind: SettingsKind, fallback: T) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const canManage =
    session?.audience === 'management' && allows('security.settings.manage')
  const queryKey = ['workspace-settings', session?.id, kind]
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => workspaceSettingsApi.load<T>(kind, signal),
    enabled: canManage,
    staleTime: Infinity,
    retry: false,
  })
  const [editing, setEditing] = useState<SettingsDocument<T> | null>(null)
  const snapshot = editing ?? query.data
  const draft = snapshot?.values ?? fallback
  const dirty =
    !!editing &&
    JSON.stringify(editing.values) !== JSON.stringify(query.data?.values)
  useErrorToast(query.error?.message, `workspace-settings-${kind}`)
  const mutation = useMutation({
    mutationFn: (values: T) =>
      workspaceSettingsApi.save(kind, snapshot!.revision, values),
    onSuccess: async (result) => {
      if (useIdentitySession.getState().session?.id !== session?.id) return
      client.setQueryData(queryKey, result)
      setEditing(null)
      await client.invalidateQueries({ queryKey: visibilityKey })
      toast.success(t('generalSettings.saved'))
    },
    onError: (error) =>
      toast.error(error.message, { id: `workspace-settings-${kind}-save` }),
  })
  return {
    draft,
    dirty,
    canManage,
    ready: !!snapshot,
    busy: query.isPending || mutation.isPending,
    blocked: !canManage || !snapshot || mutation.isPending,
    setDraft(values: T) {
      if (snapshot) setEditing({ ...snapshot, values })
    },
    save(values = draft) {
      if (snapshot && canManage && !mutation.isPending) mutation.mutate(values)
    },
    reset() {
      setEditing(null)
      void query.refetch()
    },
    async saveAsync(values = draft) {
      if (!snapshot || !canManage || mutation.isPending)
        throw new Error('Settings are unavailable')
      return mutation.mutateAsync(values)
    },
  }
}
