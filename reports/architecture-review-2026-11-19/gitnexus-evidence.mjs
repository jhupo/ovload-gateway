import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const cli = path.join(root, '.runtime/gitnexus-tools/node_modules/gitnexus/dist/cli/index.js')
const env = {
  ...process.env,
  GITNEXUS_HOME: path.join(root, '.runtime/gitnexus-state'),
  GITNEXUS_STORAGE_PATH: path.join(root, '.runtime/gitnexus-index'),
  DO_NOT_TRACK: '1',
}
const operations = [
  ['context', 'apiRequest', '-r', 'ovload-gateway', '-f', 'web/src/api/client.ts', '-l', '5'],
  ['impact', 'apiRequest', '-r', 'ovload-gateway', '-f', 'web/src/api/client.ts', '--summary-only', '--depth', '3'],
  ['context', '--uid', 'Impl:src/crates/admin/src/use_case/site_settings.rs:SiteSettingsService', '-r', 'ovload-gateway', '-l', '5'],
  ['context', 'command', '-r', 'ovload-gateway', '-f', 'src/crates/store/src/postgres/engagement/commerce.rs', '-l', '5'],
  ['context', 'complete_authorization', '-r', 'ovload-gateway', '-f', 'src/crates/admin/src/use_case/credentials/flow.rs', '-l', '5'],
  ['context', 'invalidateAccountQueries', '-r', 'ovload-gateway', '-f', 'web/src/features/accounts/query-cache.ts', '-l', '5'],
  ['query', 'subscription purchase redemption commerce', '-r', 'ovload-gateway', '-l', '3'],
]
const results = []
for (const args of operations) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  })
  let payload
  try { payload = JSON.parse(result.stdout) } catch { payload = result.stdout }
  const entry = {
    args, status: result.status, elapsedMs: Date.now() - started,
    error: result.error?.message, stderr: result.stderr, result: payload,
  }
  results.push(entry)
  fs.writeFileSync(path.join(root, 'reports/architecture-review-2026-11-19/gitnexus-evidence.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repository: root, registryName: 'ovload-gateway', results,
  }, null, 2) + '\n')
  console.log(JSON.stringify({ args, status: entry.status, elapsedMs: entry.elapsedMs, error: entry.error, keys: typeof payload === 'object' && payload ? Object.keys(payload) : [] }))
}
