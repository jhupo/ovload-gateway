import { platformRequest } from './platform-client'
import type { NumberedPage } from './upstream-accounts'

export type BackupSettings = {
  storageEnabled: boolean
  scheduleTimezone: string
  storageRevision: number
  endpoint: string | null
  region: string | null
  bucket: string | null
  prefix: string | null
  forcePathStyle: boolean
  verified: boolean
  hasAccessKey: boolean
  hasSecret: boolean
  scheduleEnabled: boolean
  cronExpression: string | null
  retentionDays: number
  retentionCount: number
  nextRunAt: string | null
  lastVerifiedAt: string | null
  updatedAt: string
}
export type BackupStorage = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey?: string
  prefix: string
  forcePathStyle: boolean
}
export type BackupSchedule = {
  scheduleEnabled: boolean
  cronExpression: string
  retentionDays: number
  retentionCount: number
}
export type ImageStorage = BackupStorage & {
  enabled: boolean
  publicDomain: string
  presignedExpiryHours: number
}
export type ImageStorageSettings = Omit<
  ImageStorage,
  'accessKeyId' | 'secretAccessKey'
> & {
  hasAccessKey: boolean
  hasSecret: boolean
  verified: boolean
}
export type RestoreAccepted = { id: string; ticket: string }
export type BackupStatus =
  | 'queued'
  | 'dumping'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'deleting'
export type BackupRecord = {
  id: string
  triggerKind: 'manual' | 'scheduled'
  status: BackupStatus
  objectKey: string
  sizeBytes: number | null
  sha256: string | null
  attemptCount: number
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export const backups = {
  imageSettings: (signal?: AbortSignal) =>
    platformRequest<ImageStorageSettings>('/settings/backups/images', {
      signal,
    }),
  imageStorage: (
    input: Omit<ImageStorage, 'accessKeyId'> & { accessKeyId?: string }
  ) =>
    platformRequest<ImageStorageSettings>('/settings/backups/images', {
      method: 'POST',
      body: input,
    }),
  testImages: () =>
    platformRequest<{ ok: boolean; message: string }>(
      '/settings/backups/images/test',
      { method: 'POST' }
    ),
  restore: (backupId: string, confirmation: string) =>
    platformRequest<RestoreAccepted>('/settings/backups/restore', {
      method: 'POST',
      body: { backupId, confirmation },
    }),
  settings: (signal?: AbortSignal) =>
    platformRequest<BackupSettings>('/settings/backups', { signal }),
  storage: (input: BackupStorage) =>
    platformRequest<BackupSettings>('/settings/backups/storage/update', {
      method: 'POST',
      body: input,
    }),
  schedule: (input: BackupSchedule) =>
    platformRequest<BackupSettings>('/settings/backups/schedule/update', {
      method: 'POST',
      body: input,
    }),
  test: () =>
    platformRequest<{
      ok: boolean
      stage: string
      code: string | null
      message: string
    }>('/settings/backups/storage/test', { method: 'POST' }),
  records: (params: URLSearchParams, signal?: AbortSignal) =>
    platformRequest<NumberedPage<BackupRecord>>(
      `/settings/backups/records?${params}`,
      { signal }
    ),
  create: (expiresInDays: number) =>
    platformRequest<BackupRecord>('/settings/backups/create', {
      method: 'POST',
      body: { expiresInDays },
    }),
  download: (backupId: string) =>
    platformRequest<{
      url: string
      fileName: string
      expiresInSeconds: number
    }>('/settings/backups/download-url', {
      method: 'POST',
      body: { backupId },
    }),
  delete: (backupId: string) =>
    platformRequest<BackupRecord>('/settings/backups/delete', {
      method: 'POST',
      body: { backupId },
    }),
}
