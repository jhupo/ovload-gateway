import { open, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values: options } = parseArgs({
  options: {
    'agy-log': { type: 'string' },
    gateway: { type: 'string' },
    login: { type: 'string' },
    'password-file': { type: 'string' },
    account: { type: 'string' },
    model: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

const MAX_LOG_BYTES = 256 * 1024
const MAX_STREAM_BYTES = 2 * 1024 * 1024
const label = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,96}$/.test(value)
    ? value
    : undefined
const httpStatus = (value) =>
  Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined

async function localGenerationRequests(path) {
  const file = await open(path, 'r')
  try {
    const { size, mtime } = await file.stat()
    const bytes = Buffer.alloc(Math.min(size, MAX_LOG_BYTES))
    const { bytesRead } = await file.read(bytes, 0, bytes.length, size - bytes.length)
    const results = []
    for (const line of bytes.subarray(0, bytesRead).toString('utf8').split(/\r?\n/)) {
      const route = line.match(/\b((?:daily-)?cloudcode-pa\.googleapis\.com)\/v1internal:(streamGenerateContent|generateContent)\b/)
      if (!route) continue
      const time = line.match(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/)?.[0]
      results.push({ time, host: route[1], operation: route[2] })
    }
    return { logModifiedAt: mtime.toISOString(), generationRequests: results.slice(-10) }
  } finally {
    await file.close()
  }
}

function terminalEvent(frame) {
  const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
  if (!data.length) return
  const event = JSON.parse(data.map((line) => line.slice(5).trimStart()).join('\n'))
  if (event.type === 'test_complete' && event.success === true) {
    return { outcome: 'success' }
  }
  if (event.type === 'error') {
    return {
      outcome: 'probe_failed',
      upstreamStatus: httpStatus(event.upstreamStatus),
      errorCode: label(event.providerErrorCode),
      gatewayErrorCode: label(event.gatewayErrorCode),
      source: label(event.source),
      sendState: label(event.sendState),
    }
  }
}

async function readProbe(response) {
  const meta = {
    httpStatus: response.status,
    retryAfter: response.headers.get('retry-after') ?? undefined,
  }
  if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
    await response.body?.cancel()
    return { ...meta, outcome: 'probe_http_error' }
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return { ...meta, ...(terminalEvent(buffer) ?? { outcome: 'incomplete_stream' }) }
      bytes += value.byteLength
      if (bytes > MAX_STREAM_BYTES) return { ...meta, outcome: 'stream_limit' }
      buffer += decoder.decode(value, { stream: true })
      let boundary
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const result = terminalEvent(buffer.slice(0, boundary.index))
        if (result) return { ...meta, ...result }
        buffer = buffer.slice(boundary.index + boundary[0].length)
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

async function gatewayProbe() {
  const origin = new URL(options.gateway)
  const loopback = origin.hostname === '127.0.0.1' || origin.hostname === 'localhost'
  if (origin.href !== origin.origin + '/' || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback))) {
    throw new Error('Use an HTTPS gateway origin, or HTTP loopback for a test fixture.')
  }
  if (!options.login || !label(options.account) || !label(options.model)) {
    throw new Error('--gateway requires --login, --account and --model.')
  }
  const password = options['password-file']
    ? (await readFile(options['password-file'], 'utf8')).replace(/\r?\n$/, '')
    : process.env.OVLOAD_PROBE_PASSWORD
  if (!password) throw new Error('Set OVLOAD_PROBE_PASSWORD or supply --password-file.')
  const headers = { Origin: origin.origin, 'Content-Type': 'application/json' }
  const login = await fetch(new URL('/api/v1/auth/sessions', origin), {
    method: 'POST',
    headers,
    body: JSON.stringify({ login: options.login, password }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!login.ok) {
    await login.body?.cancel()
    return { outcome: 'login_failed', httpStatus: login.status, retryAfter: login.headers.get('retry-after') ?? undefined }
  }
  const session = await login.json()
  const cookie = login.headers.getSetCookie()
    .find((value) => value.startsWith('__Host-ovload_management='))
    ?.split(';', 1)[0]
  if (session.audience !== 'management' || !cookie || !session.csrf_token) {
    return { outcome: 'management_session_unavailable' }
  }
  const probe = await fetch(new URL('/api/admin/accounts/connection-test', origin), {
    method: 'POST',
    headers: { ...headers, Cookie: cookie, 'X-CSRF-Token': session.csrf_token, Accept: 'text/event-stream' },
    body: JSON.stringify({ accountId: options.account, modelId: options.model, mode: 'regular', prompt: 'Reply with OK.' }),
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  })
  return { model: options.model, ...await readProbe(probe) }
}

async function main() {
  if (options.help) {
    console.log('node scripts/compare-agy-probe.mjs [--agy-log PATH] [--gateway ORIGIN --login USER --account ID --model MODEL [--password-file PATH]]')
    return
  }
  const logPath = options['agy-log'] ?? join(homedir(), '.gemini', 'antigravity-cli', 'cli.log')
  let agy
  try {
    agy = await localGenerationRequests(logPath)
  } catch (error) {
    if (error.code !== 'ENOENT' || options['agy-log']) throw error
    agy = { outcome: 'local_log_unavailable' }
  }
  const startedAt = new Date().toISOString()
  const gateway = options.gateway ? { startedAt, ...await gatewayProbe() } : undefined
  console.log(JSON.stringify({ agy, gateway }, null, 2))
  if (gateway && gateway.outcome !== 'success') process.exitCode = 1
}

main().catch((error) => {
  console.error(JSON.stringify({ outcome: 'diagnostic_error', errorType: error.name, code: label(error.code) }))
  process.exitCode = 1
})
