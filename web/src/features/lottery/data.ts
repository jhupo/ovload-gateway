export type LotteryRound = {
  status?: 'drawn' | 'cancelled'
  id: number
  participants: number
  winners: number
  rewardCents: number
  drawnAt: string
}

export const pastRounds: LotteryRound[] = []
export type LotteryWinner = { id: string; name: string; rewardCents: number }
export const recentWinners: LotteryWinner[] = []
export const personalWinnings: Pick<
  LotteryRound,
  'id' | 'rewardCents' | 'drawnAt'
>[] = []
