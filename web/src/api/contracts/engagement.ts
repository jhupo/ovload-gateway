export type LotteryRound = {
  status?: 'drawn' | 'cancelled'
  id: number
  participants: number
  winners: number
  rewardCents: number
  drawnAt: string
}
export type LotteryWinner = { id: string; name: string; rewardCents: number }
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
export type InvitationRecord = {
  id: string
  invitee: string
  registeredAt: string
}
export type RebateRecord = {
  id: string
  invitee: string
  purchaseCents: number
  rebateCents: number
  status: 'frozen' | 'released'
  createdAt: string
}
export type TransferRecord = {
  id: string
  amountCents: number
  createdAt: string
}
