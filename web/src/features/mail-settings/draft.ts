import {
  createEmailTemplates,
  readEmailTemplates,
  type EmailTemplates,
} from './templates'

export type MailDraft = {
  smtpHost: string
  smtpPort: string
  smtpUsername: string
  smtpUseTls: boolean
  senderEmail: string
  senderName: string
  templates: EmailTemplates
}

export const mailStorageKey = 'ovload.mail-settings.draft'
export const initialMailDraft: MailDraft = {
  smtpHost: '',
  smtpPort: '587',
  smtpUsername: '',
  smtpUseTls: true,
  senderEmail: '',
  senderName: '',
  templates: createEmailTemplates(),
}

export function readMailDraft(): MailDraft {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(mailStorageKey) ?? 'null'
    )
    if (value && typeof value === 'object') {
      const input = value as Record<string, unknown>
      // Explicitly allowlist non-secret fields when reading browser storage.
      return {
        smtpHost: typeof input.smtpHost === 'string' ? input.smtpHost : '',
        smtpPort: typeof input.smtpPort === 'string' ? input.smtpPort : '587',
        smtpUsername:
          typeof input.smtpUsername === 'string' ? input.smtpUsername : '',
        smtpUseTls:
          typeof input.smtpUseTls === 'boolean' ? input.smtpUseTls : true,
        senderEmail:
          typeof input.senderEmail === 'string' ? input.senderEmail : '',
        senderName:
          typeof input.senderName === 'string' ? input.senderName : '',
        templates: readEmailTemplates(input.templates),
      }
    }
  } catch {
    // Storage failure leaves the form editable; saving reports the error.
  }
  return initialMailDraft
}

function validHost(value: string) {
  if (!value || value.length > 253 || /[\s/@?#\\]/.test(value)) return false
  try {
    const url = new URL(`https://${value}`)
    return url.hostname === value.toLowerCase() && !url.port
  } catch {
    return false
  }
}

export function mailDraftErrors(draft: MailDraft) {
  const errors: Partial<Record<keyof MailDraft, string>> = {}
  if (
    ![
      draft.smtpHost,
      draft.smtpUsername,
      draft.senderEmail,
      draft.senderName,
    ].some((value) => value.trim()) &&
    draft.smtpPort === '587'
  )
    return errors
  if (!validHost(draft.smtpHost.trim())) errors.smtpHost = 'hostError'
  if (
    !/^\d+$/.test(draft.smtpPort.trim()) ||
    Number(draft.smtpPort) < 1 ||
    Number(draft.smtpPort) > 65535
  )
    errors.smtpPort = 'portError'
  if (draft.smtpUsername.trim().length > 254)
    errors.smtpUsername = 'usernameError'
  if (
    draft.senderEmail.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.senderEmail.trim())
  )
    errors.senderEmail = 'emailError'
  if (draft.senderName.trim().length > 100)
    errors.senderName = 'senderNameError'
  return errors
}

export function normalizeMailDraft(draft: MailDraft): MailDraft {
  // Do not spread external state into the persisted draft: secrets are excluded.
  return {
    smtpHost: draft.smtpHost.trim().toLowerCase(),
    smtpPort: String(Number(draft.smtpPort)),
    smtpUsername: draft.smtpUsername.trim(),
    smtpUseTls: draft.smtpUseTls,
    senderEmail: draft.senderEmail.trim(),
    senderName: draft.senderName.trim(),
    templates: readEmailTemplates(draft.templates),
  }
}
