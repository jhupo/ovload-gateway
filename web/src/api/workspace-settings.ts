import type {
  AuditDraft,
  ChannelMonitoringDraft,
  ReferralDraft,
} from './contracts/settings'
import { apiRequest } from './client'

export type FeatureSettingsValues = {
  audit: AuditDraft
  referral: ReferralDraft
}
export type PageSettingsValues = {
  channelStatusEnabled: boolean
  lotteryEnabled: boolean
  monitoring: ChannelMonitoringDraft
}
export type WorkspaceVisibility = {
  securityAudit: boolean
  referral: boolean
  channelStatus: boolean
  lottery: boolean
}
export type SettingsDocument<T> = {
  revision: number
  values: T
  updated_at: string
}
export type SettingsKind = 'features' | 'pages'

export const workspaceSettingsApi = {
  load: async <T>(kind: SettingsKind, signal?: AbortSignal) =>
    (
      await apiRequest<SettingsDocument<T>>(
        'management',
        `/workspace/settings/${kind}`,
        { signal }
      )
    ).data,
  save: async <T>(kind: SettingsKind, revision: number, values: T) =>
    (
      await apiRequest<SettingsDocument<T>>(
        'management',
        `/workspace/settings/${kind}`,
        {
          method: 'PATCH',
          revision,
          body: { values },
        }
      )
    ).data,
  visibility: async (signal?: AbortSignal) =>
    (
      await apiRequest<WorkspaceVisibility>(
        'customer',
        '/workspace/visibility',
        { public: true, signal }
      )
    ).data,
}
