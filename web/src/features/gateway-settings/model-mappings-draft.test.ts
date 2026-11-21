import { describe, expect, it } from 'vitest'
import { modelMappingsError, validModelMappingId } from './model-mappings-draft'

describe('global model mapping contract', () => {
  it('accepts exact IDs without trimming or changing case', () => {
    expect(modelMappingsError({ 'Model A': 'Upstream/B' })).toBeUndefined()
    expect(validModelMappingId('a'.repeat(256))).toBe(true)
    expect(validModelMappingId('\u4e2d'.repeat(85))).toBe(true)
    expect(validModelMappingId('\u4e2d'.repeat(86))).toBe(false)
  })

  it('rejects reserved IDs and the domain control character range', () => {
    for (const value of [
      '',
      '__system',
      'model\n',
      'model\u007f',
      'model\u0085',
      'model\u009f',
    ])
      expect(validModelMappingId(value)).toBe(false)
    expect(modelMappingsError({ valid: '__system' })).toBe('modelIdError')
  })

  it('enforces the backend mapping count limit', () => {
    const mappings = Object.fromEntries(
      Array.from({ length: 512 }, (_, index) => [`model-${index}`, 'upstream'])
    )
    expect(modelMappingsError(mappings)).toBeUndefined()
    expect(modelMappingsError({ ...mappings, extra: 'upstream' })).toBe(
      'mappingLimit'
    )
  })
})
