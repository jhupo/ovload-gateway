import type { GatewaySettingsSnapshot } from '@/api/gateway-settings'
import { gatewayDraft, type GatewayDraft } from './draft'

function equalValues(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalValues(value, right[index]))
    )
  const leftFields = left as Record<string, unknown>
  const rightFields = right as Record<string, unknown>
  const keys = Object.keys(leftFields)
  return (
    keys.length === Object.keys(rightFields).length &&
    keys.every(
      (key) =>
        Object.hasOwn(rightFields, key) &&
        equalValues(leftFields[key], rightFields[key])
    )
  )
}

export function reconcileGatewayRevision(
  saved: GatewayDraft,
  draft: GatewayDraft,
  snapshot: GatewaySettingsSnapshot
): { saved: GatewayDraft; draft: GatewayDraft } | null {
  const revision = snapshot.configRevision
  if (revision < saved.configRevision || revision < draft.configRevision)
    return null
  const next = gatewayDraft(snapshot)
  const baseline = { ...saved, configRevision: revision }
  if (!equalValues(baseline, next)) return null
  return {
    saved: { ...saved, configRevision: revision },
    draft: { ...draft, configRevision: revision },
  }
}
