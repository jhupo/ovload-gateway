import { z } from 'zod'
import i18n from '@/i18n'
import { parseUsd } from '@/lib/usd'
import { sessionPort } from './session-port'
import { ApiError } from './errors'
import { apiRequest } from './client'
import type { WalletBalance } from './wallet'

const usd = z.string().refine((value) => parseUsd(value) !== null)
const walletSchema = z
  .object({
    tenant_id: z.string().uuid(),
    currency: z.literal('USD'),
    scale: z.literal(10),
    settled_usd: usd,
    held_usd: usd,
    available_usd: usd,
  })
  .strict()
  .refine((balance) => {
    const settled = parseUsd(balance.settled_usd)
    const held = parseUsd(balance.held_usd)
    const available = parseUsd(balance.available_usd)
    return (
      settled !== null &&
      held !== null &&
      available !== null &&
      held <= settled &&
      available === settled - held
    )
  })

const receiptSchema = z
  .object({
    ledger_entry_id: z.string().uuid(),
    amount_usd: usd.refine((value) => (parseUsd(value) ?? 0n) > 0n),
    balance: walletSchema,
    created_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((receipt) => {
    const amount = parseUsd(receipt.amount_usd)
    const balance = parseUsd(receipt.balance.settled_usd)
    return amount !== null && balance !== null && balance >= amount
  })

export type WalletCreditInput = {
  amountUsd: string
  reason: string
  paidCny?: string
}
export type WalletCreditReceipt = z.infer<typeof receiptSchema>

const creditEntrySchema = z
  .object({
    ledger_entry_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    principal_id: z.string().uuid(),
    kind: z.literal('admin'),
    amount_usd: usd.refine((value) => (parseUsd(value) ?? 0n) > 0n),
    reason: z.string(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict()
const creditPageSchema = z
  .object({
    items: z.array(creditEntrySchema).max(50),
    next_cursor: z.string().uuid().nullable(),
    currency: z.literal('USD'),
    scale: z.literal(10),
    total_credited_usd: z.string().regex(/^\d+(?:\.\d{1,10})?$/),
  })
  .strict()

export type WalletCreditEntry = z.infer<typeof creditEntrySchema>
export type WalletCreditPage = z.infer<typeof creditPageSchema>

export function requireWalletOwner(ownerId: string | undefined) {
  const session = sessionPort().getSession()
  if (!ownerId || session?.id !== ownerId || session.audience !== 'management')
    throw new ApiError(
      401,
      'identity.unauthorized',
      i18n.t('identity.errors.unauthorized'),
      undefined,
      ownerId
    )
}

function walletPath(tenantId: string) {
  if (!z.string().uuid().safeParse(tenantId).success)
    throw new ApiError(
      400,
      'identity.invalid_input',
      i18n.t('identity.errors.invalid_input')
    )
  return `/billing/wallets/${encodeURIComponent(tenantId)}`
}

function invalidResponse(ownerId: string) {
  return new ApiError(
    503,
    'identity.unavailable',
    i18n.t('identity.errors.unavailable'),
    undefined,
    ownerId
  )
}

export function validateWalletCredit(input: WalletCreditInput) {
  const amount = parseUsd(input.amountUsd)
  if (amount === null || amount <= 0n)
    throw new ApiError(
      400,
      'identity.invalid_input',
      i18n.t('users.invalid_credit_amount')
    )
  const reasonBytes = new TextEncoder().encode(input.reason).length
  const control = Array.from(input.reason).some((character) => {
    const point = character.codePointAt(0) ?? 0
    return point <= 0x1f || (point >= 0x7f && point <= 0x9f)
  })
  if (
    !reasonBytes ||
    reasonBytes > 512 ||
    input.reason.trim() !== input.reason ||
    control
  )
    throw new ApiError(
      400,
      'identity.invalid_input',
      i18n.t('users.invalid_credit_reason')
    )
  return amount
}

export async function getManagementWallet(
  ownerId: string,
  tenantId: string,
  signal?: AbortSignal
): Promise<WalletBalance> {
  requireWalletOwner(ownerId)
  const { data } = await apiRequest<unknown>(
    'management',
    walletPath(tenantId),
    {
      signal,
    }
  )
  requireWalletOwner(ownerId)
  const result = walletSchema.safeParse(data)
  if (!result.success || result.data.tenant_id !== tenantId)
    throw invalidResponse(ownerId)
  return result.data
}

export async function creditManagementWallet(
  ownerId: string,
  tenantId: string,
  input: WalletCreditInput,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<WalletCreditReceipt> {
  requireWalletOwner(ownerId)
  const amount = validateWalletCredit(input)
  if (
    !idempotencyKey.length ||
    idempotencyKey.length > 128 ||
    Array.from(idempotencyKey).some((character) => {
      const point = character.codePointAt(0) ?? 0
      return point < 0x21 || point > 0x7e
    })
  )
    throw new ApiError(
      400,
      'identity.invalid_input',
      i18n.t('identity.errors.invalid_input')
    )
  const { data } = await apiRequest<unknown>(
    'management',
    `${walletPath(tenantId)}/credits`,
    {
      method: 'POST',
      body: {
        amount_usd: input.amountUsd,
        reason: input.reason,
        paid_cny: input.paidCny,
      },
      idempotencyKey,
      signal,
    }
  )
  requireWalletOwner(ownerId)
  const result = receiptSchema.safeParse(data)
  if (
    !result.success ||
    result.data.balance.tenant_id !== tenantId ||
    parseUsd(result.data.amount_usd) !== amount
  )
    throw invalidResponse(ownerId)
  return result.data
}

export async function listManagementWalletCredits(
  ownerId: string,
  tenantId: string,
  cursor?: string,
  signal?: AbortSignal
): Promise<WalletCreditPage> {
  requireWalletOwner(ownerId)
  const query = new URLSearchParams({ limit: '50' })
  if (cursor !== undefined) {
    if (!z.string().uuid().safeParse(cursor).success)
      throw new ApiError(
        400,
        'identity.invalid_input',
        i18n.t('identity.errors.invalid_input')
      )
    query.set('cursor', cursor)
  }
  const { data } = await apiRequest<unknown>(
    'management',
    `${walletPath(tenantId)}/credits?${query}`,
    { signal }
  )
  requireWalletOwner(ownerId)
  const result = creditPageSchema.safeParse(data)
  if (
    !result.success ||
    result.data.items.some((entry) => entry.tenant_id !== tenantId) ||
    new Set(result.data.items.map((entry) => entry.ledger_entry_id)).size !==
      result.data.items.length ||
    (result.data.next_cursor !== null &&
      result.data.items.at(-1)?.ledger_entry_id !== result.data.next_cursor)
  )
    throw invalidResponse(ownerId)
  return result.data
}
