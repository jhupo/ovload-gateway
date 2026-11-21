import { describe, expect, it } from 'vitest'
import { logMessage } from './log-message'

describe('operational log messages', () => {
  it('extracts the human summary without exposing the envelope in the table', () => {
    expect(
      logMessage(
        '{"message":"Worker failed","correlationId":"worker:analytics"}'
      )
    ).toBe('Worker failed')
  })
  it('preserves plain text, malformed JSON and non-message JSON', () => {
    for (const value of [
      'Connection refused',
      '{broken',
      'null',
      '{"message":3}',
      '{"message":""}',
    ]) {
      expect(logMessage(value)).toBe(value)
    }
  })
})
