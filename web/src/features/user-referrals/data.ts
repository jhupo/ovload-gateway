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

export const personalInvitations: InvitationRecord[] = []
export const personalRebates: RebateRecord[] = []
export const personalTransfers: TransferRecord[] = []
