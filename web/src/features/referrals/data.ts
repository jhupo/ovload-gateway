export type RecordKind = 'invitations' | 'rebates' | 'withdrawals'
export type Person = { id: string; name: string; email: string }
export type LedgerRow = {
  rate?: string
  status?: 'frozen' | 'released'
  id: string
  user: Person
  invitee?: Person
  at: string
  code: string
  amount: number
  credited: number
  paid: number
  balance: number
  available: number
  frozen: number
  total: number
}
export const ledgers: Record<RecordKind, LedgerRow[]> = {
  invitations: [],
  rebates: [],
  withdrawals: [],
}
