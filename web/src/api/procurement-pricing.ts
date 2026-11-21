import { platformRequest } from './platform-client'

export type ProcurementRates = {
  input: string
  output: string
  cacheRead: string
  cacheWrite: string
}
export type ProcurementPrice = {
  deleted?: boolean
  multiplierBps: number
  bands: Record<string, ProcurementRates>
}
export type PriceCatalog = Record<string, Record<string, ProcurementPrice>>
export type PricingSyncPreview = {
  prices: PriceCatalog
  skipped: string[]
}
export type ProcurementCatalog = {
  defaults: PriceCatalog
  synced: PriceCatalog
  overrides: PriceCatalog
  syncedAt: string | null
  syncedAtDisplay: string | null
}

export const procurementPricingApi = {
  load: (signal?: AbortSignal) =>
    platformRequest<ProcurementCatalog>('/settings/pricing', { signal }),
  previewSync: (signal?: AbortSignal) =>
    platformRequest<PricingSyncPreview>('/settings/pricing/sync/preview', {
      method: 'POST',
      signal,
      timeoutMs: 45_000,
    }),
  sync: (preview: PricingSyncPreview, models: Record<string, string[]>) =>
    platformRequest<{ saved: boolean }>('/settings/pricing/sync', {
      method: 'POST',
      body: { preview, models },
      timeoutMs: 45_000,
    }),
  replace: (provider: string, model: string, pricing: ProcurementPrice) =>
    platformRequest<{ saved: boolean }>('/settings/pricing/update', {
      method: 'POST',
      body: {
        provider,
        models: [model],
        change: { action: 'replace', pricing },
      },
    }),
  reset: (provider: string, model: string) =>
    platformRequest<{ saved: boolean }>('/settings/pricing/update', {
      method: 'POST',
      body: { provider, models: [model], change: { action: 'reset' } },
    }),
  remove: (provider: string, model: string) =>
    platformRequest<{ saved: boolean }>('/settings/pricing/update', {
      method: 'POST',
      body: { provider, models: [model], change: { action: 'delete' } },
    }),
}
