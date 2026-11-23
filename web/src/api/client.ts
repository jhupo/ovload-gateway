import i18n from '@/i18n'
import { sessionPort } from './session-port'
import { ApiError } from './errors'
import {
  codeValue,
  localizeAdminError,
  stringValue,
} from './error-localization'
import { transportRequest } from './transport'
import type { Audience } from './types'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  revision?: number | string
  idempotencyKey?: string
  signal?: AbortSignal
  public?: boolean
  responseType?: 'blob'
}

type ErrorPayload = {
  error?: { code?: unknown; message?: unknown }
  code?: unknown
  errorKey?: unknown
  params?: unknown
  message?: unknown
  request_id?: unknown
  requestId?: unknown
}

export async function apiRequest<T>(
  audience: Audience,
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; etag: string | null }> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API paths must be relative to the identity namespace')
  }
  const method = options.method ?? 'GET'
  const initiatingSessionId = sessionPort().getSession()?.id
  const response = await transportRequest({
    audience,
    path,
    method,
    body: options.body,
    signal: options.signal,
    accept: options.responseType === 'blob' ? 'text/csv' : 'application/json',
    public: options.public,
    revision: options.revision,
    idempotencyKey: options.idempotencyKey,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  const payload: unknown =
    response.status === 204
      ? undefined
      : response.ok && options.responseType === 'blob'
        ? contentType.includes('text/csv')
          ? await response.blob()
          : undefined
        : contentType.includes('application/json')
          ? await response.json()
          : undefined
  if (!response.ok) {
    const error = payload as ErrorPayload | undefined
    const code =
      codeValue(error?.error?.code) ??
      codeValue(error?.code) ??
      'identity.unavailable'
    const message =
      stringValue(error?.error?.message) ??
      stringValue(error?.message) ??
      i18n.t('auth.error')
    const errorKey = stringValue(error?.errorKey)
    throw new ApiError(
      response.status,
      code,
      localizeAdminError(code, response.status, message, errorKey, error?.params),
      stringValue(error?.request_id) ??
        stringValue(error?.requestId) ??
        response.headers.get('X-Request-Id') ??
        undefined,
      initiatingSessionId
    )
  }
  if (response.status !== 204 && payload === undefined) {
    throw new ApiError(
      503,
      'identity.unavailable',
      'Invalid API response',
      response.headers.get('X-Request-Id') ?? undefined,
      initiatingSessionId
    )
  }
  return { data: payload as T, etag: response.headers.get('ETag') }
}
