export type AuditRecord = {
  id: string
  at: string
  stage: 'input' | 'output'
  groupId: string
  user: string
  email: string
  keyName: string
  keyId?: string
  endpoint: string
  model: string
  result: 'pass' | 'flagged' | 'blocked' | 'error'
  action: 'none' | 'recorded' | 'blocked' | 'failed'
  latencyMs: number
  summary: string
  risks: {
    category: 'jailbreak' | 'pii' | 'violence' | 'keyword' | 'custom'
    name?: string
    score: number
    threshold: number
  }[]
}

export function filterAuditRecords(
  records: AuditRecord[],
  filter: { query: string; stage: string; result: string; group: string }
) {
  const query = filter.query.trim().toLowerCase()
  return records.filter(
    (record) =>
      (filter.stage === 'all' || record.stage === filter.stage) &&
      (filter.result === 'all' || record.result === filter.result) &&
      (filter.group === 'all' || record.groupId === filter.group) &&
      [
        record.id,
        record.user,
        record.email,
        record.keyName,
        record.summary,
      ].some((value) => value.toLowerCase().includes(query))
  )
}
