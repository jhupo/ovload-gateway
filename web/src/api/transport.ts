import { ensureStepUp } from './step-up'
import { sessionPort } from './session-port'
import { ApiError } from './errors'
import {
  consumeHumanToken,
  resetHumanVerification,
} from '@/lib/human-verification'

type TransportAudience = 'customer' | 'management' | 'platform'

export type TransportRequest = {
  audience: TransportAudience
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  accept?: string
  skipStepUp?: boolean
  public?: boolean
  revision?: number | string
  idempotencyKey?: string
}

function endpoint(audience: TransportAudience, path: string) {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('API paths must be relative resource paths')
  return `${audience === 'platform' ? '/api/admin' : audience === 'management' ? '/api/admin/v1' : '/api/v1'}${path}`
}

export async function transportRequest({
  audience,
  path,
  method = 'GET',
  body,
  signal,
  timeoutMs = 15_000,
  accept = 'application/json',
  skipStepUp = false,
  public: isPublic = false,
  revision,
  idempotencyKey,
}: TransportRequest): Promise<Response> {
  const session = sessionPort().getSession()
  if (!isPublic && audience !== 'customer' && session?.audience !== 'management')
    throw new ApiError(401, 'identity.unauthorized', 'Management session required')
  if (!isPublic && audience === 'customer' && method !== 'GET' && session?.audience !== 'customer')
    throw new ApiError(401, 'identity.unauthorized', 'Customer session required')
  if (!isPublic && audience !== 'customer' && method !== 'GET' && !skipStepUp)
    await ensureStepUp()
  const current = sessionPort().getSession()
  const csrf = isPublic || method === 'GET' ? undefined : current?.csrf_token
  if (method !== 'GET' && !csrf) {
    if (!isPublic && current?.id) sessionPort().invalidateSession(current.id)
    throw new ApiError(401, 'identity.unauthorized', 'Session expired', undefined, current?.id)
  }
  const headers = new Headers({ Accept: accept })
  if (body !== undefined)
    headers.set(
      'Content-Type',
      body instanceof Blob ? body.type || 'application/octet-stream' : 'application/json'
    )
  if (csrf) headers.set('X-CSRF-Token', csrf)
  if (revision !== undefined) {
    if (
      typeof revision === 'number' &&
      (!Number.isSafeInteger(revision) || revision < 1)
    )
      throw new ApiError(400, 'identity.invalid_input', 'Invalid revision')
    headers.set('If-Match', typeof revision === 'number' ? `"${revision}"` : revision)
  }
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  const human = isPublic && method !== 'GET' ? consumeHumanToken() : ''
  if (human) headers.set('X-Turnstile-Token', human)
  try {
    const requestBody: BodyInit | undefined =
      body === undefined
        ? undefined
        : body instanceof Blob
          ? body
          : JSON.stringify(body)
    const response = await fetch(endpoint(audience, path), {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
      body: requestBody,
    })
    if (response.status === 401 && !isPublic && current?.id)
      sessionPort().invalidateSession(current.id)
    if (!isPublic && current?.id && sessionPort().getSession()?.id !== current.id)
      throw new ApiError(401, 'identity.unauthorized', 'Session changed', undefined, current.id)
    return response
  } finally {
    if (isPublic && method !== 'GET') resetHumanVerification()
  }
}
