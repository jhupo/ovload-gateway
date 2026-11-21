import { expect, test } from 'vitest'
import type {
  ProcurementCatalog,
  ProcurementPrice,
} from '@/api/procurement-pricing'
import {
  canonicalPrice,
  emptyPrices,
  newPricingEntry,
  normalizedPrice,
  pricingErrors,
  pricingRows,
  priceEditorEntry,
} from './pricing-draft'

const price = (input = '1.2500'): ProcurementPrice => ({
  multiplierBps: 10_000,
  bands: {
    standard: { input, output: '10', cacheRead: '0.0001', cacheWrite: '0' },
  },
})
const entry = (provider = 'openai_api') => ({
  ...newPricingEntry(provider),
  model: 'fixture-model',
  bands: price().bands,
})

test('USD per million retains exact per-token precision and rejects rounding', () => {
  expect(canonicalPrice('0001.2500')).toBe('1.25')
  expect(canonicalPrice('0.0001')).toBe('0.0001')
  expect(canonicalPrice('1000000.0000')).toBe('1000000')
  expect(canonicalPrice('0')).toBe('0')
  for (const value of [
    '',
    '-1',
    '+1',
    '1e3',
    '0.00001',
    '1000000.0001',
    '1000001',
    'NaN',
  ])
    expect(canonicalPrice(value)).toBeNull()
  expect(normalizedPrice(entry())).toEqual({
    ...price(),
    bands: {
      standard: {
        input: '1.25',
        output: '10',
        cacheRead: '0.0001',
        cacheWrite: '0',
      },
    },
  })
})

test('public API requires explicit complete text-tier rates even when other products have defaults', () => {
  expect(pricingErrors(entry(), false)).toEqual({})
  expect(
    pricingErrors({ ...entry(), bands: {} }, true)['bands.standard.input']
  ).toBe('standardRequired')
  expect(
    pricingErrors({ ...entry(), bands: { standard: emptyPrices() } }, false)
  ).not.toEqual({})
  for (const band of ['long_standard', 'image', 'ultrafast'] as const)
    expect(
      pricingErrors(
        {
          ...entry(),
          bands: { ...entry().bands, [band]: price().bands.standard },
        },
        false
      )[`bands.${band}.input`]
    ).toBe('unsupportedBand')
  expect(
    pricingErrors(
      { ...entry('openai'), bands: {}, multiplierBps: 12_500 },
      true
    )
  ).toEqual({})
  expect(pricingErrors({ ...entry('openai'), bands: {} }, false)).not.toEqual(
    {}
  )
  expect(pricingErrors({ ...entry(), multiplierBps: 0 }, false)).toEqual({})
  expect(
    pricingErrors({ ...entry(), multiplierBps: 1_000_001 }, false)
  ).toHaveProperty('multiplierBps')
})

test('catalog projection preserves exact product identity, sparse overrides, source and zero', () => {
  const catalog: ProcurementCatalog = {
    defaults: {
      openai: { 'fixture-model': price('4') },
      openai_api: {},
      xai: {},
    },
    synced: {
      openai: {
        'fixture-model': {
          multiplierBps: 10_000,
          bands: { fast: price('6').bands.standard },
        },
      },
    },
    overrides: {
      openai: { 'fixture-model': { multiplierBps: 12_500, bands: {} } },
      openai_api: { 'fixture-model': price('0') },
    },
    syncedAt: null,
    syncedAtDisplay: null,
  }
  const rows = pricingRows(catalog)
  expect(rows).toHaveLength(2)
  const codex = rows.find((row) => row.provider === 'openai')!
  const api = rows.find((row) => row.provider === 'openai_api')!
  expect(codex.bands).toEqual({})
  expect(codex.effective.bands.standard.input).toBe('4')
  expect(codex.effective.bands.fast.input).toBe('6')
  expect(codex.effective.multiplierBps).toBe(12_500)
  expect(api.effective.bands.standard.input).toBe('0')
  expect(api.knownModel).toBe(false)
  expect(codex.id).not.toBe(api.id)
  expect(api.source).toBe('override')
  expect(normalizedPrice(codex)).toEqual({ multiplierBps: 12_500, bands: {} })
  const editor = priceEditorEntry(codex)
  expect(editor.multiplierBps).toBe(10_000)
  expect(editor.bands.standard?.input).toBe('4')
  expect(editor.bands.fast?.input).toBe('6')
  editor.bands.standard!.input = '7'
  expect(codex.effective.bands.standard.input).toBe('4')
})

test('model IDs retain case and follow the backend UTF-8 byte and whitespace limits', () => {
  expect(pricingErrors({ ...entry(), model: 'Fixture-model' }, false)).toEqual(
    {}
  )
  expect(
    pricingErrors({ ...entry(), model: '\u6a21'.repeat(42) }, false)
  ).toEqual({})
  for (const model of [
    '',
    ' fixture-model',
    'fixture model',
    'fixture\u0001model',
    'x'.repeat(129),
    '\u6a21'.repeat(43),
  ])
    expect(pricingErrors({ ...entry(), model }, false)).not.toEqual({})
})

test('deleted prices mask built-in and synced rows while preserving other providers', () => {
  const catalog: ProcurementCatalog = {
    defaults: {
      openai: { 'fixture-model': price() },
      xai: { 'fixture-model': price() },
    },
    synced: { openai: { 'fixture-model': price('2') } },
    overrides: {
      openai: {
        'fixture-model': { deleted: true, multiplierBps: 10000, bands: {} },
      },
    },
    syncedAt: null,
    syncedAtDisplay: null,
  }
  expect(pricingRows(catalog).map((row) => row.provider)).toEqual(['xai'])
  catalog.overrides.openai['fixture-model'] = price('3')
  expect(
    pricingRows(catalog).find((row) => row.provider === 'openai')?.effective
      .bands.standard.input
  ).toBe('3')
})
