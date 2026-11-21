import type { AuthSettings } from '@/api/auth-settings'
import type { SiteSettingsInput } from '@/api/site-settings'
import { parseUsd } from '@/lib/usd'
import { parseEmailWhitelist } from './login'

export function authSettingsErrors(
  value: AuthSettings,
  emailWhitelist: string
) {
  const errors: Record<string, string> = {}
  if (parseEmailWhitelist(emailWhitelist) === null)
    errors.emailWhitelist = 'emailWhitelistError'
  if (parseUsd(value.gift_usd) === null)
    errors.defaultBalance = 'defaultBalanceError'
  if (
    !Number.isInteger(value.default_user_concurrency) ||
    value.default_user_concurrency < 1 ||
    value.default_user_concurrency > 10000
  )
    errors.defaultConcurrency = 'defaultConcurrencyError'
  if (
    !Number.isInteger(value.default_user_rpm) ||
    value.default_user_rpm < 1 ||
    value.default_user_rpm > 1000000
  )
    errors.defaultRpm = 'defaultRpmError'
  const { agreement } = value
  if (
    (agreement.enabled && !agreement.documents.length) ||
    agreement.documents.some(
      (doc) =>
        !doc.title.trim() ||
        doc.title !== doc.title.trim() ||
        new TextEncoder().encode(doc.title).length > 80 ||
        /\p{Cc}/u.test(doc.title) ||
        !doc.content.trim() ||
        Array.from(doc.content).length > 30000 ||
        Array.from(doc.content).some(
          (char) => /\p{Cc}/u.test(char) && !['\n', '\r', '\t'].includes(char)
        )
    )
  )
    errors.agreement = 'agreementError'
  if (
    agreement.documents.some(
      (doc, index, docs) =>
        !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(doc.slug) ||
        docs.some(
          (other, otherIndex) => otherIndex !== index && other.slug === doc.slug
        )
    )
  )
    errors.agreement = 'slugError'
  return errors
}

export function siteFields(value: SiteSettingsInput): SiteSettingsInput {
  return {
    name: value.name,
    subtitle: value.subtitle,
    support: value.support,
    endpoint: value.endpoint,
  }
}

export function siteErrors(value: SiteSettingsInput) {
  const errors: Partial<Record<keyof SiteSettingsInput, string>> = {}
  for (const [key, maximum] of [
    ['name', 80],
    ['subtitle', 160],
    ['support', 500],
    ['endpoint', 500],
  ] as const) {
    const text = value[key]
    if (key === 'name' && !text) errors[key] = 'required'
    else if (
      Array.from(text).length > maximum ||
      text.trim() !== text ||
      /\p{Cc}/u.test(text)
    )
      errors[key] = 'textError'
  }
  if (value.endpoint) {
    try {
      const url = new URL(value.endpoint)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.port === '0' ||
        /\s/u.test(value.endpoint) ||
        value.endpoint.includes('?') ||
        value.endpoint.includes('#')
      )
        errors.endpoint = 'urlError'
    } catch {
      errors.endpoint = 'urlError'
    }
  }
  return errors
}
