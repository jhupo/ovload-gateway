export type PersonalRedemption = {
  id: string
  maskedCode: string
  type: 'balance' | 'plan' | 'concurrency' | 'invitation'
  creditCents: number | null
  plan: string | null
  days: number | null
  redeemedAt: string
}

export const personalRedemptions: PersonalRedemption[] = []
