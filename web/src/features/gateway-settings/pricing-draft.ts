import { z } from 'zod'
import type {
  ProcurementCatalog,
  ProcurementPrice,
  ProcurementRates,
} from '@/api/procurement-pricing'
import { requiresStandardPricingBand } from '@/lib/upstream-platforms'

export const priceBands = [
  'standard',
  'fast',
  'ultrafast',
  'flex',
  'long_standard',
  'long_fast',
  'long_ultrafast',
  'long_flex',
  'image',
] as const
export const priceFields = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
] as const
export type PriceBand = (typeof priceBands)[number]
export type TokenPrices = ProcurementRates

// Four decimal places per million tokens preserve the per-token USD precision.
export function canonicalPrice(value: string): string | null {
  if (!/^\d{1,7}(?:\.\d{1,4})?$/.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  const ticks = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
  if (ticks > 10000000000n) return null
  const decimal = (ticks % 10000n)
    .toString()
    .padStart(4, '0')
    .replace(/0+$/, '')
  return `${ticks / 10000n}${decimal ? '.' + decimal : ''}`
}
const amount = z
  .string()
  .refine((value) => canonicalPrice(value) !== null, 'priceError')
const rates = z.object({
  input: amount,
  output: amount,
  cacheRead: amount,
  cacheWrite: amount,
})
export const pricingEntrySchema = z.object({
  id: z.string().min(1).max(512),
  provider: z.string().min(1).max(128),
  model: z
    .string()
    .min(1)
    .refine(
      (value) =>
        new TextEncoder().encode(value).length <= 128 &&
        !/[\s\p{Cc}]/u.test(value),
      'modelError'
    ),
  multiplierBps: z.number().int().min(0).max(1_000_000),
  bands: z
    .object({
      standard: rates.optional(),
      fast: rates.optional(),
      ultrafast: rates.optional(),
      flex: rates.optional(),
      long_standard: rates.optional(),
      long_fast: rates.optional(),
      long_ultrafast: rates.optional(),
      long_flex: rates.optional(),
      image: rates.optional(),
    })
    .strict(),
})
export type PricingEntry = z.infer<typeof pricingEntrySchema>
export type PricingRow = PricingEntry & {
  source: 'builtin' | 'synced' | 'override'
  knownModel: boolean
  effective: ProcurementPrice
}
export function priceEditorEntry(row: PricingRow): PricingEntry {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    multiplierBps: 10_000,
    bands: structuredClone(row.effective.bands),
  }
}
export const emptyPrices = (): TokenPrices => ({
  input: '',
  output: '',
  cacheRead: '',
  cacheWrite: '',
})
export const newPricingEntry = (provider: string): PricingEntry => ({
  id: crypto.randomUUID(),
  provider,
  model: '',
  multiplierBps: 10_000,
  bands: { standard: emptyPrices() },
})
export function supportedBands(provider: string): readonly PriceBand[] {
  if (provider === 'claude' || provider === 'gemini' || provider === 'xai_api')
    return ['standard']
  if (provider === 'openai_api') return ['standard', 'fast', 'flex']
  if (provider === 'xai')
    return ['standard', 'fast', 'long_standard', 'long_fast']
  return priceBands
}
export function pricingErrors(
  entry: PricingEntry,
  knownModel: boolean
): Record<string, string> {
  const result = pricingEntrySchema.safeParse(entry)
  if (!result.success)
    return Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join('.'),
        issue.path[0] === 'model'
          ? 'modelError'
          : issue.path[0] === 'provider'
            ? 'providerError'
            : issue.path[0] === 'multiplierBps'
              ? 'multiplierError'
              : issue.message === 'priceError'
                ? issue.message
                : 'invalid',
      ])
    )
  if (
    (!knownModel || requiresStandardPricingBand(entry.provider)) &&
    !entry.bands.standard
  )
    return { 'bands.standard.input': 'standardRequired' }
  const unsupported = priceBands.find(
    (band) =>
      entry.bands[band] && !supportedBands(entry.provider).includes(band)
  )
  return unsupported
    ? { [`bands.${unsupported}.input`]: 'unsupportedBand' }
    : {}
}
export function normalizedPrice(entry: PricingEntry): ProcurementPrice {
  pricingEntrySchema.parse(entry)
  const canonical = (value: string): string => {
    const result = canonicalPrice(value)
    if (result === null) throw new Error('Invalid procurement rate')
    return result
  }
  const bands: ProcurementPrice['bands'] = {}
  for (const band of priceBands) {
    const prices = entry.bands[band]
    if (prices) {
      bands[band] = {
        input: canonical(prices.input),
        output: canonical(prices.output),
        cacheRead: canonical(prices.cacheRead),
        cacheWrite: canonical(prices.cacheWrite),
      }
    }
  }
  return { multiplierBps: entry.multiplierBps, bands }
}
function merged(
  left: ProcurementPrice | undefined,
  right: ProcurementPrice | undefined
): ProcurementPrice {
  return {
    multiplierBps: right?.multiplierBps ?? left?.multiplierBps ?? 10_000,
    bands: { ...left?.bands, ...right?.bands },
  }
}
export function pricingRows(catalog: ProcurementCatalog): PricingRow[] {
  const rows: PricingRow[] = []
  const providers = new Set([
    ...Object.keys(catalog.defaults),
    ...Object.keys(catalog.synced),
    ...Object.keys(catalog.overrides),
  ])
  for (const provider of providers) {
    const models = new Set([
      ...Object.keys(catalog.defaults[provider] ?? {}),
      ...Object.keys(catalog.synced[provider] ?? {}),
      ...Object.keys(catalog.overrides[provider] ?? {}),
    ])
    for (const model of models) {
      const builtin = catalog.defaults[provider]?.[model]
      const synced = catalog.synced[provider]?.[model]
      const override = catalog.overrides[provider]?.[model]
      if (override?.deleted) continue
      const base = merged(builtin, synced)
      const price = override ?? base
      rows.push({
        id: JSON.stringify([provider, model]),
        provider,
        model,
        multiplierBps: price.multiplierBps,
        bands: structuredClone(price.bands),
        source: override ? 'override' : synced ? 'synced' : 'builtin',
        knownModel: !!(builtin || synced),
        effective: merged(base, override),
      })
    }
  }
  return rows.sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
  )
}
