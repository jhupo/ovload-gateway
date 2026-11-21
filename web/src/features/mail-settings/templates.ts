import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

export const templateEvents = [
  'verification',
  'passwordReset',
  'subscriptionActivated',
  'subscriptionExpiry',
  'lowBalance',
  'rechargeSuccess',
  'auditViolation',
  'accountDisabled',
] as const
export const templateLocales = ['zh', 'en'] as const
export type TemplateEvent = (typeof templateEvents)[number]
export type TemplateLocale = (typeof templateLocales)[number]
export type EmailTemplate = { subject: string; html: string }
export type EmailTemplates = Record<
  TemplateEvent,
  Record<TemplateLocale, EmailTemplate>
>
export type TemplateIssue = {
  event: TemplateEvent
  locale: TemplateLocale
  field: keyof EmailTemplate
  message: string
}

const eventVariables: Record<TemplateEvent, string[]> = {
  verification: ['verification_code', 'expires_in_minutes'],
  passwordReset: ['reset_url', 'expires_in_minutes'],
  subscriptionActivated: ['subscription_group', 'expiry_time'],
  subscriptionExpiry: ['subscription_group', 'expiry_time', 'days_remaining'],
  lowBalance: ['current_balance', 'threshold'],
  rechargeSuccess: ['recharge_amount', 'order_id', 'current_balance'],
  auditViolation: ['group_name', 'rule_name', 'violation_count'],
  accountDisabled: ['rule_name', 'violation_count', 'ban_threshold'],
}

const templateAccents: Record<TemplateEvent, string> = {
  verification: '#4f46e5',
  passwordReset: '#7c3aed',
  subscriptionActivated: '#2563eb',
  subscriptionExpiry: '#f97316',
  lowBalance: '#d97706',
  rechargeSuccess: '#16a34a',
  auditViolation: '#ef4444',
  accountDisabled: '#dc2626',
}

export function templateVariables(event: TemplateEvent) {
  return [
    'site_name',
    'recipient_name',
    'recipient_email',
    ...eventVariables[event],
  ]
}

export function defaultTemplate(
  event: TemplateEvent,
  locale: TemplateLocale
): EmailTemplate {
  const messages = (locale === 'zh' ? zh : en).mailSettings
  const copy = messages.templateDefaults[event]
  const accent = templateAccents[event]
  // Adapted from Sub2API notificationEmailCard; see THIRD_PARTY_NOTICES.md.
  return {
    subject: copy.subject,
    html: `<!DOCTYPE html>
<html lang="${locale === 'zh' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${messages.templateEvents[event]}</title>
  <style>
    body { margin: 0; padding: 24px; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #18181b; letter-spacing: 0; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.10); }
    .header { padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 24px; line-height: 1.25; }
    .content { padding: 32px; font-size: 15px; line-height: 1.7; }
    .content p:first-child { margin-top: 0; }
    .content p:last-child { margin-bottom: 0; }
    .verification-code { font-size: 32px; font-weight: 700; text-align: center; }
    .button { display: inline-block; margin-top: 12px; padding: 11px 18px; border-radius: 8px; background: ${accent}; color: #ffffff; text-decoration: none; font-weight: 600; }
    .muted { color: #71717a; font-size: 13px; }
    .footer { padding: 18px 32px; background: #fafafa; color: #71717a; font-size: 12px; line-height: 1.6; }
    .header, .content, .footer { overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      body { padding: 16px; }
      .header, .content { padding: 24px; }
      .header h1 { font-size: 22px; }
      .footer { padding: 16px 24px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: ${accent}; color: #ffffff;">
      <h1>${messages.templateEvents[event]}</h1>
    </div>
    <div class="content">
      <p>${messages.templateLayout.greeting}</p>
      ${copy.body}
    </div>
    <div class="footer">${messages.templateLayout.footer}</div>
  </div>
</body>
</html>`,
  }
}

export function createEmailTemplates(): EmailTemplates {
  return Object.fromEntries(
    templateEvents.map((event) => [
      event,
      Object.fromEntries(
        templateLocales.map((locale) => [
          locale,
          defaultTemplate(event, locale),
        ])
      ),
    ])
  ) as EmailTemplates
}

export function readEmailTemplates(value: unknown): EmailTemplates {
  const defaults = createEmailTemplates()
  if (!value || typeof value !== 'object') return defaults
  for (const event of templateEvents) {
    const translations = (value as Record<string, unknown>)[event]
    if (!translations || typeof translations !== 'object') continue
    for (const locale of templateLocales) {
      const template = (translations as Record<string, unknown>)[locale]
      if (!template || typeof template !== 'object') continue
      const { subject, html } = template as Record<string, unknown>
      if (typeof subject === 'string' && typeof html === 'string')
        defaults[event][locale] = {
          subject,
          html,
        }
    }
  }
  return defaults
}

function contentError(value: string, limit: number, event: TemplateEvent) {
  if (!value.trim() || value.length > limit) return 'templateRequired'
  const allowed = templateVariables(event)
  const tokens = [...value.matchAll(/{{\s*([a-z_]+)\s*}}/g)]
  if (
    tokens.some((match) => !allowed.includes(match[1])) ||
    /{{|}}/.test(value.replace(/{{\s*[a-z_]+\s*}}/g, ''))
  )
    return 'templateVariableError'
  return undefined
}

export function firstTemplateIssue(
  templates: EmailTemplates
): TemplateIssue | undefined {
  for (const event of templateEvents) {
    for (const locale of templateLocales) {
      for (const field of ['subject', 'html'] as const) {
        const value = templates[event][locale][field]
        const message =
          field === 'subject' && /[\r\n]/.test(value)
            ? 'templateSubjectError'
            : contentError(value, field === 'subject' ? 200 : 30000, event)
        if (message) return { event, locale, field, message }
      }
    }
  }
}

export const previewValues: Record<string, string> = {
  site_name: 'Ovload',
  recipient_name: 'Demo user',
  recipient_email: 'demo@example.com',
  verification_code: '123456',
  expires_in_minutes: '10',
  reset_url: 'https://example.com/reset-password',
  subscription_group: 'Standard',
  expiry_time: '2026-11-01 00:00 UTC',
  days_remaining: '3',
  current_balance: '$5.00',
  threshold: '$10.00',
  recharge_amount: '$20.00',
  order_id: 'DEMO-001',
  group_name: 'Demo group',
  rule_name: 'Demo rule',
  violation_count: '3',
  ban_threshold: '3',
}

function replaceVariables(value: string, html = false) {
  return value.replace(/{{\s*([a-z_]+)\s*}}/g, (token, key: string) => {
    const sample = previewValues[key] ?? token
    if (!html) return sample
    const span = document.createElement('span')
    span.textContent = sample
    return span.innerHTML
  })
}

export function previewTemplate(template: EmailTemplate) {
  // Template fragments stay inert until isolated by the iframe's CSP and sandbox.
  const fragment = document.createElement('template')
  fragment.innerHTML = replaceVariables(template.html, true)
  fragment.content
    .querySelectorAll('script,iframe,object,embed,link,base,meta,form,svg,math')
    .forEach((node) => node.remove())
  fragment.content.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name.startsWith('on') ||
        attribute.localName === 'href' ||
        (attribute.name === 'src' &&
          !attribute.value.startsWith('data:image/')) ||
        [
          'srcset',
          'poster',
          'background',
          'action',
          'formaction',
          'srcdoc',
          'target',
        ].includes(attribute.name)
      )
        element.removeAttribute(attribute.name)
    }
  })
  return {
    subject: replaceVariables(template.subject),
    html: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fragment.innerHTML}</body></html>`,
  }
}
