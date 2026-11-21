import { apiRequest } from './client'

export type IntegrationDocument<T> = {
  revision: number
  values: T
  hasSecrets: Record<string, boolean>
}
export const integrations = {
  load: async <T>(kind: string, signal?: AbortSignal) =>
    (
      await apiRequest<IntegrationDocument<T>>(
        'management',
        `/settings/integrations/${kind}`,
        { signal }
      )
    ).data,
  save: async <T>(
    kind: string,
    revision: number,
    values: T,
    secrets: Record<string, string | null>
  ) =>
    (
      await apiRequest<IntegrationDocument<T>>(
        'management',
        `/settings/integrations/${kind}`,
        { method: 'PATCH', revision, body: { values, secrets } }
      )
    ).data,
  mailTest: async (recipient?: string) =>
    (
      await apiRequest('management', '/settings/mail/test', {
        method: 'POST',
        body: { recipient: recipient || null },
      })
    ).data,
  auditTest: async (id: string) =>
    (
      await apiRequest<{ ok: boolean; latencyMs: number }>(
        'management',
        `/settings/audit/${encodeURIComponent(id)}/test`,
        { method: 'POST', body: {} }
      )
    ).data,
  backupToggle: async (revision: number, enabled: boolean) =>
    (
      await apiRequest('management', '/settings/backups/state', {
        method: 'PATCH',
        revision,
        body: { enabled },
      })
    ).data,
}
