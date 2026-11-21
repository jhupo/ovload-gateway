import { describe, expect, it } from 'vitest'
import {
  validatePrivacyPolicy,
  validateRequestLocation,
  validateWarmupSchedule,
} from './codex-api'
import type { CodexPrivacyPolicy, PrivacyStep } from '@/api/contracts/codex'

function step(overrides: Partial<PrivacyStep> = {}): PrivacyStep {
  return {
    scope: 'request_body',
    selector: '$.metadata',
    action: 'remove_field',
    pattern: null,
    replacement: '',
    value: null,
    replaceAll: true,
    caseInsensitive: false,
    multiLine: false,
    ...overrides,
  }
}
function policy(steps: PrivacyStep[] = [step()]): CodexPrivacyPolicy {
  return {
    enabled: true,
    onError: 'reject_request',
    rules: [{ id: 'fixture', name: 'Fixture', enabled: true, steps }],
  }
}

describe('Codex setting contracts', () => {
  it('accepts single and multiple daily times at the server schedule boundaries', () => {
    for (const value of [
      '00:00',
      '23:59',
      '08:00,13:30',
      Array(42).fill('08:00').join(','),
    ])
      expect(validateWarmupSchedule(value)).toBeUndefined()
    for (const value of [
      '',
      '8:00',
      '24:00',
      '08:60',
      '08:00,',
      ' 08:00',
      '08:00, 13:00',
      '08:00\n',
      Array(43).fill('08:00').join(','),
    ])
      expect(validateWarmupSchedule(value)).toBe('scheduleError')
  })

  it('checks country codes, Unicode text lengths, control characters, and IANA time zones', () => {
    const location = {
      country: 'US',
      region: 'Ohio',
      city: 'Piketon',
      timezone: 'America/New_York',
    }
    expect(validateRequestLocation(location)).toBeUndefined()
    expect(
      validateRequestLocation({
        ...location,
        country: 'CN',
        region: '上海',
        city: '上海',
        timezone: 'Asia/Shanghai',
      })
    ).toBeUndefined()
    for (const invalid of [
      { country: 'us' },
      { country: 'USA' },
      { region: ' ' },
      { city: 'X'.repeat(129) },
      { city: 'Fixture\n' },
      { timezone: 'Invalid/Time_Zone' },
    ])
      expect(validateRequestLocation({ ...location, ...invalid })).toBe(
        'locationError'
      )
  })

  it('counts all rules and steps, including disabled rules, against the shared backend budget', () => {
    expect(
      validatePrivacyPolicy(policy(Array.from({ length: 32 }, () => step())))
    ).toBeUndefined()
    expect(
      validatePrivacyPolicy(policy(Array.from({ length: 33 }, () => step())))
    ).toBe('privacyError')
    expect(validatePrivacyPolicy(policy([]))).toBe('privacyError')
    const duplicate = policy()
    duplicate.rules.push({ ...duplicate.rules[0], enabled: false })
    expect(validatePrivacyPolicy(duplicate)).toBe('privacyError')
    const disabled = policy()
    disabled.enabled = false
    disabled.rules[0].enabled = false
    disabled.rules[0].name = ''
    expect(validatePrivacyPolicy(disabled)).toBe('privacyError')
  })

  it('validates structural selector and action restrictions without a JavaScript regex compiler', () => {
    expect(
      validatePrivacyPolicy(
        policy([step({ scope: 'environment_text', selector: '$.path' })])
      )
    ).toBe('privacyError')
    expect(
      validatePrivacyPolicy(
        policy([
          step({
            scope: 'request_header',
            selector: 'x-fixture',
            action: 'rename_key',
            pattern: 'old',
          }),
        ])
      )
    ).toBe('privacyError')
    expect(
      validatePrivacyPolicy(
        policy([step({ action: 'set_value', pattern: 'old' })])
      )
    ).toBe('privacyError')
    expect(
      validatePrivacyPolicy(policy([step({ selector: 'metadata' })]))
    ).toBe('privacyError')
    // Rust owns regex compilation, including named captures unsupported by JavaScript.
    expect(
      validatePrivacyPolicy(
        policy([
          step({
            action: 'regex_replace',
            pattern: '(?P<private>secret)',
            replacement: '${private}',
          }),
        ])
      )
    ).toBeUndefined()
    expect(
      validatePrivacyPolicy(
        policy([step({ action: 'regex_replace', pattern: '(?=secret)' })])
      )
    ).toBeUndefined()
  })

  it('uses UTF-8 byte bounds for rule names and replacement values', () => {
    const value = policy()
    value.rules[0].name = '字'.repeat(64)
    expect(validatePrivacyPolicy(value)).toBeUndefined()
    value.rules[0].name += '字'
    expect(validatePrivacyPolicy(value)).toBe('privacyError')
    expect(
      validatePrivacyPolicy(
        policy([step({ action: 'set_value', value: '字'.repeat(1400) })])
      )
    ).toBe('privacyError')
  })
})
