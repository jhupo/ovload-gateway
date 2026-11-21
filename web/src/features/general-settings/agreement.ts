export type Agreement = {
  enabled: boolean
  mode: 'modal' | 'checkbox'
  updated: string
  documents: { id: string; title: string; slug: string; content: string }[]
}
export function createAgreement(): Agreement {
  return {
    enabled: false,
    mode: 'modal',
    updated: '',
    documents: [],
  }
}
export function isAgreement(value: unknown): value is Agreement {
  if (!value || typeof value !== 'object') return false
  const a = value as Agreement
  return (
    typeof a.enabled === 'boolean' &&
    ['modal', 'checkbox'].includes(a.mode) &&
    typeof a.updated === 'string' &&
    Array.isArray(a.documents) &&
    a.documents.length <= 10 &&
    a.documents.every(
      (d) =>
        d &&
        typeof d.id === 'string' &&
        typeof d.title === 'string' &&
        typeof d.slug === 'string' &&
        typeof d.content === 'string'
    )
  )
}
