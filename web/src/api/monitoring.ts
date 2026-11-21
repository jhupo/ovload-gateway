import { apiRequest } from './client'

export type SystemLog = {
  id: string
  occurredAt: string
  level: string
  component: string
  message: string
  requestId: string | null
  provider: string | null
  accountId: string | null
  fields: Record<string, unknown>
}
export type LogConfig = {
  revision: number
  enabled: boolean
  level: string
  retentionDays: number
}
export type SystemResources = {
  database: { size: number; idle: number; max: number }
  redis: {
    connected: number | null
    blocked: number | null
    max: number | null
  }
  process: {
    sampledAt: string
    cpuPercent: number | null
    memory: { total: number | null; used: number | null }
    jobs: {
      total: number
      running: number
      failed: number
      items: {
        id: string
        state: string
        failures: number
        cycles: number
        lastSuccess: string | null
        lastFailure: string | null
      }[]
    }
    logs: {
      queued: number
      written: number
      dropped: number
      writeFailures: number
    }
  }
}
export const monitoringApi = {
  resources: async (signal?: AbortSignal) =>
    (
      await apiRequest<SystemResources>('management', '/monitoring/resources', {
        signal,
      })
    ).data,
  logs: async (params: URLSearchParams, signal?: AbortSignal) =>
    (
      await apiRequest<{ items: SystemLog[]; total: number }>(
        'management',
        `/monitoring/logs?${params}`,
        { signal }
      )
    ).data,
  config: async (signal?: AbortSignal) =>
    (
      await apiRequest<LogConfig>('management', '/monitoring/logs/config', {
        signal,
      })
    ).data,
  saveConfig: async (body: LogConfig) =>
    (
      await apiRequest<LogConfig>('management', '/monitoring/logs/config', {
        method: 'PUT',
        body,
        revision: body.revision,
      })
    ).data,
  cleanup: async (before: string) =>
    (
      await apiRequest<{ deleted: number; hasMore: boolean }>(
        'management',
        '/monitoring/logs/cleanup',
        { method: 'POST', body: { before } }
      )
    ).data,
}

export type MonitoringPoint = {
  bucket: string
  seconds: number
  requests: number
  succeeded: number
  failed: number
  tokens: number | null
  latencyMs: number | null
  firstTokenMs: number | null
  latencySamples: number
  firstTokenSamples: number
}
export type ActiveRequest = {
  id: string
  user: string
  provider: string | null
  concurrent: number
  limit: number
  status: 'processing' | 'queued'
}
export type MonitoringSnapshot = {
  from: string
  to: string
  points: MonitoringPoint[]
  activeSummary: { total: number; users: number; threads: number; page: number }
  active: ActiveRequest[]
}
export async function loadMonitoring(
  params: URLSearchParams,
  signal?: AbortSignal
) {
  return (
    await apiRequest<MonitoringSnapshot>(
      'management',
      `/monitoring?${params}`,
      { signal }
    )
  ).data
}
