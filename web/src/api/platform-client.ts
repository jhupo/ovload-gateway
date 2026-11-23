import { ApiError } from './errors'
import {
  codeValue,
  localizeAdminError,
  stringValue,
} from './error-localization'
import { sessionPort } from './session-port'
import { transportRequest } from './transport'

type PlatformRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
}

export class PlatformPreflightError extends Error {
  constructor(error: unknown) {
    super(
      error instanceof Error
        ? error.message
        : 'Authentication could not be completed'
    )
    this.name = 'PlatformPreflightError'
  }
}

export async function platformRequest<T>(
  path: string,
  options: PlatformRequestOptions = {}
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Platform paths must be relative resource paths')
  const method = options.method ?? 'GET'
  const session = sessionPort().getSession()
  if (method !== 'GET') {
    try {
      const response = await transportRequest({
        audience: 'platform',
        path,
        method,
        body: options.body,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      })
      return parsePlatformResponse<T>(response, session?.id)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new PlatformPreflightError(error)
    }
  }
  const response = await transportRequest({
    audience: 'platform',
    path,
    method,
    body: options.body,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  })
  return parsePlatformResponse<T>(response, session?.id)
}

async function parsePlatformResponse<T>(
  response: Response,
  sessionId?: string
) {
  const payload: unknown = response.headers
    .get('Content-Type')
    ?.includes('application/json')
    ? await response.json()
    : undefined
  const envelope = payload as
    | {
        code?: number
        errorKey?: string
        params?: unknown
        message?: string
        data?: T
      }
    | undefined
  if (!response.ok || envelope?.code !== 200 || envelope.data === undefined) {
    throw new ApiError(
      response.ok ? 503 : response.status,
      `platform.${envelope?.code ?? 'unavailable'}`,
      localizeAdminError(
        codeValue(envelope?.code) ?? 'unavailable',
        response.ok ? 503 : response.status,
        stringValue(envelope?.message) ?? response.statusText,
        stringValue(envelope?.errorKey),
        envelope?.params
      ),
      response.headers.get('X-Request-Id') ?? undefined,
      sessionId
    )
  }
  if (sessionId && sessionPort().getSession()?.id !== sessionId)
    throw new ApiError(
      401,
      'identity.unauthorized',
      'Session changed',
      undefined,
      sessionId
    )
  return envelope.data
}
