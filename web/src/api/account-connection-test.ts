import i18n from '@/i18n'
import { sessionPort } from './session-port'
import { ApiError } from './errors'
import { transportRequest } from './transport'

export async function testAccountConnection(
  accountId: string,
  model: string,
  signal: AbortSignal,
  onContent: (text: string) => void,
  options?: {
    mode?: 'regular' | 'compact'
    prompt?: string
    onImage?: (url: string) => void
    onEvent?: (type: string) => void
  }
): Promise<void> {
  const session = sessionPort().getSession()
  if (session?.audience !== 'management')
    throw new ApiError(
      401,
      'identity.unauthorized',
      i18n.t('upstreamAccounts.sessionChanged')
    )
  if (!session.csrf_token)
    throw new ApiError(
      401,
      'identity.unauthorized',
      i18n.t('upstreamAccounts.sessionChanged')
    )
  const response = await transportRequest({
    audience: 'platform',
    path: '/accounts/connection-test',
    method: 'POST',
    body: {
      accountId,
      modelId: model,
      mode: options?.mode ?? 'regular',
      ...(options?.prompt ? { prompt: options.prompt } : {}),
    },
    accept: 'text/event-stream',
    signal,
    timeoutMs: 600000,
  })
  if (response.status === 401)
    sessionPort().invalidateSession(session.id)
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get('content-type')?.includes('text/event-stream')
  ) {
    const body = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new ApiError(
      response.status,
      'platform.connection_test',
      body?.message ?? response.statusText
    )
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (sessionPort().getSession()?.id !== session.id)
        throw new Error(i18n.t('upstreamAccounts.sessionChanged'))
      buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, '')
      if (buffer.length > 12 * 1024 * 1024)
        throw new Error(i18n.t('upstreamAccounts.testResponseLimit'))
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (!data) continue
        const event = JSON.parse(data) as {
          type: string
          text?: string
          image_url?: string
          success?: boolean
          error?: string
        }
        if (event.type !== 'content') options?.onEvent?.(event.type)
        if (event.type === 'error')
          throw new Error(event.error || i18n.t('upstreamAccounts.testFailed'))
        if (event.type === 'content' && event.text) onContent(event.text)
        if (event.type === 'image' && event.image_url) {
          const url = event.image_url
          const safe =
            /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url) ||
            (() => {
              try {
                const parsed = new URL(url)
                return (
                  parsed.protocol === 'https:' &&
                  !parsed.username &&
                  !parsed.password
                )
              } catch {
                return false
              }
            })()
          if (!safe || url.length > 9 * 1024 * 1024)
            throw new Error(i18n.t('upstreamAccounts.testFailed'))
          options?.onImage?.(url)
        }
        if (event.type === 'test_complete' && event.success) return
      }
      if (done) throw new Error(i18n.t('upstreamAccounts.testIncomplete'))
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
