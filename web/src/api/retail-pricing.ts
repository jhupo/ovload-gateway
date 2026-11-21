import { apiRequest } from './client'

export const usageDimensions = [
  'input_tokens',
  'cache_read_tokens',
  'cache_write_tokens_5m',
  'cache_write_tokens_1h',
  'output_tokens',
  'audio_input_tokens',
  'audio_output_tokens',
  'image_input',
  'image_output',
  'audio_input_seconds',
  'audio_output_seconds',
  'search_calls',
  'tool_calls',
  'request_fee',
] as const
export type UsageDimension = (typeof usageDimensions)[number]
export type PriceUnit =
  | 'per_1m_tokens'
  | 'per_image'
  | 'per_audio_second'
  | 'per_call'
  | 'per_request'
export type RetailRate = {
  dimension: UsageDimension
  unit: PriceUnit
  rate_usd_per_unit: string
  billable: boolean
}
export type RetailCard = {
  account_group_id: string | null
  public_model_id: string
  service_tier: string
  rates: RetailRate[]
}
export type PriceSummary = {
  id: string
  revision_no: number
  row_version: number
  state: 'draft' | 'published' | 'retired'
  checksum: string | null
  effective_at: string | null
  created_at: string
  published_at: string | null
  retired_at: string | null
}
export type PriceCatalog = {
  generation: number
  published_revision_id: string | null
}
export type PricePage = {
  currency: 'USD'
  scale: 10
  catalog: PriceCatalog
  items: PriceSummary[]
  next_cursor: number | null
}
export type PriceDetail = {
  currency: 'USD'
  scale: 10
  catalog: PriceCatalog
  revision: PriceSummary & { document: { cards: RetailCard[] } }
}
export type PricePreview = {
  currency: 'USD'
  scale: 10
  revision: PriceSummary
  selected_account_group_id: string | null
  public_model_id: string
  service_tier: string
  multiplier_bps: number
  total_usd: string
  components: (RetailRate & {
    quantity: number
    exact_subtotal_usd: { numerator: string; denominator: string }
  })[]
}
export type EffectivePrice = {
  currency: 'USD'
  scale: 10
  catalog_generation: number
  revision_id: string
  account_group_id: string
  selected_account_group_id: string | null
  public_model_id: string
  service_tier: string
  multiplier_bps: number
  rates: (RetailRate & { effective_rate_usd_per_unit: string })[]
}
export type PriceSelector = {
  account_group_id: string
  public_model_id: string
  service_tier: string
}
export type SamplePriceInput = PriceSelector & {
  multiplier_bps: number
  usage: { dimension: UsageDimension; quantity: number }[]
}

const base = '/pricing/revisions'
export const retailPricing = {
  list: (cursor?: number, signal?: AbortSignal) =>
    apiRequest<PricePage>(
      'management',
      `${base}?limit=50${cursor === undefined ? '' : `&cursor=${cursor}`}`,
      { signal }
    ),
  get: (id: string, signal?: AbortSignal) =>
    apiRequest<PriceDetail>('management', `${base}/${encodeURIComponent(id)}`, {
      signal,
    }),
  create: (
    cards: RetailCard[],
    reason: string,
    catalogEtag: string,
    idempotencyKey: string
  ) =>
    apiRequest<PriceDetail>('management', base, {
      method: 'POST',
      body: { cards, reason },
      revision: catalogEtag,
      idempotencyKey,
    }),
  change: (
    action: 'publish' | 'retire',
    detail: PriceDetail,
    etag: string,
    reason: string,
    idempotencyKey: string
  ) =>
    apiRequest<PriceDetail>(
      'management',
      `${base}/${encodeURIComponent(detail.revision.id)}/${action}`,
      {
        method: 'POST',
        revision: etag,
        idempotencyKey,
        body: {
          expected_catalog_generation: detail.catalog.generation,
          reason,
        },
      }
    ),
  validate: (id: string) =>
    apiRequest<PriceDetail>(
      'management',
      `${base}/${encodeURIComponent(id)}/validate`,
      { method: 'POST', body: {} }
    ),
  preview: (id: string, input: SamplePriceInput) =>
    apiRequest<PricePreview>(
      'management',
      `${base}/${encodeURIComponent(id)}/preview`,
      { method: 'POST', body: input }
    ),
  effective: (selector: PriceSelector, signal?: AbortSignal) =>
    apiRequest<EffectivePrice>(
      'management',
      `/pricing/effective?${new URLSearchParams(selector)}`,
      { signal }
    ),
}

export function rateUnit(dimension: UsageDimension): PriceUnit {
  if (dimension.endsWith('tokens') || dimension.includes('tokens_'))
    return 'per_1m_tokens'
  if (dimension.startsWith('image_')) return 'per_image'
  if (dimension.endsWith('_seconds')) return 'per_audio_second'
  if (dimension === 'request_fee') return 'per_request'
  return 'per_call'
}

export function emptyRetailCard(): RetailCard {
  return {
    account_group_id: null,
    public_model_id: '',
    service_tier: 'default',
    rates: usageDimensions.slice(0, 5).map((dimension) => ({
      dimension,
      unit: rateUnit(dimension),
      rate_usd_per_unit: '0',
      billable: false,
    })),
  }
}

export function validRate(value: string): boolean {
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,10})?$/.test(value)
}

export function nonzeroRate(value: string): boolean {
  return /[1-9]/.test(value)
}
