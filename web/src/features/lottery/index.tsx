import { useRef, useState } from 'react'
import {
  Gift,
  History,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Play,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { allows } from '@/stores/identity-session'
import { useEngagement, type LotteryState } from '@/hooks/use-engagement'
import { useUserWorkspace } from '@/hooks/use-user-workspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { defaultLottery } from '@/features/page-settings/lottery-draft'
import { LotteryStartDialog } from '@/features/page-settings/lottery-start-dialog'
import { RoundsTable } from './rounds-table'

export function Lottery() {
  const [publishing, setPublishing] = useState(false)
  const publishButton = useRef<HTMLButtonElement>(null)
  const state = useEngagement<LotteryState>('lottery')
  const current = state.data?.current
  const recentWinners = state.data?.winners ?? []
  const personalWinnings = state.data?.personalWinnings ?? []
  const [challenge, setChallenge] = useState<{
    id: string
    image: string
    round: number
  } | null>(null)
  const [answer, setAnswer] = useState('')
  async function join() {
    if (!current) return
    try {
      if (current.humanVerification) {
        const value = (await state.execute({
          op: 'lottery_challenge',
          round_id: current.id,
        })) as { id: string; image: string }
        setChallenge({ ...value, round: current.id })
        setAnswer('')
      } else {
        await state.execute({ op: 'join_lottery', round_id: current.id })
        toast.success(t('lottery.joined'))
      }
    } catch {
      /* The request hook displays the error. */
    }
  }
  const { t, i18n } = useTranslation()
  const user = useUserWorkspace()
  const tr = (key: string) => t(`lottery.${key}`)
  const reward = (cents: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
    }).format(cents / 100)
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: 'UTC',
      dateStyle: 'medium',
    }).format(new Date(value))
  return (
    <>
      {!user && (
        <Header fixed className='bg-background'>
          <ProfileDropdown />
        </Header>
      )}
      <Main id='content' className='@container/lottery flex-1'>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center gap-3'
        >
          <h1 className='text-2xl font-semibold'>{tr('title')}</h1>
          {!user && allows('security.settings.manage') && (
            <Button
              ref={publishButton}
              className='ms-auto'
              disabled={!state.data || !!current || state.busy}
              onClick={() => setPublishing(true)}
            >
              <Play />
              {t('lotterySettings.start')}
            </Button>
          )}
        </div>
        {publishing && (
          <LotteryStartDialog
            initial={defaultLottery()}
            onClose={() => setPublishing(false)}
            restoreFocus={() => publishButton.current?.focus()}
          />
        )}
        <div className='grid min-w-0 gap-5 @4xl/lottery:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'>
          <Card
            className='min-w-0 gap-0 rounded-lg py-0 shadow-none'
            data-testid='lottery-current'
          >
            <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5'>
              <div className='flex items-center gap-3'>
                <span className='flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary'>
                  <Gift aria-hidden='true' className='size-5' />
                </span>
                <h2 className='text-base font-semibold'>
                  {tr('currentRound')}
                </h2>
              </div>
              <Badge variant='outline'>
                {current ? `#${current.id}` : t('lottery.noActiveRound')}
              </Badge>
            </div>
            <div className='flex flex-1 flex-col gap-6 p-4 sm:p-5'>
              <dl className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
                {['reward', 'winners', 'target'].map((key, index) => (
                  <div
                    key={key}
                    className={
                      index === 0
                        ? 'col-span-2 min-w-0 space-y-2 sm:col-span-1'
                        : 'min-w-0 space-y-2'
                    }
                  >
                    <dt className='text-xs text-muted-foreground'>{tr(key)}</dt>
                    <dd className='text-xl font-semibold tabular-nums sm:text-2xl'>
                      {current
                        ? [
                            reward(current.rewardCents),
                            current.winnerCount,
                            current.participantTarget,
                          ][index]
                        : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              <Separator />
              <div className='space-y-3'>
                <div className='flex items-center justify-between gap-3 text-xs'>
                  <span className='flex items-center gap-1.5 text-muted-foreground'>
                    <Users aria-hidden='true' className='size-3.5' />
                    {tr('progress')}
                  </span>
                  <span className='tabular-nums'>
                    {current?.participants ?? 0} /{' '}
                    {current?.participantTarget ?? '—'}
                  </span>
                </div>
                <Progress
                  value={
                    current
                      ? (current.participants / current.participantTarget) * 100
                      : 0
                  }
                  aria-label={tr('progress')}
                  className='h-2 rounded-sm'
                />
                <div className='flex items-center justify-between gap-3 text-xs text-muted-foreground'>
                  <span>{tr('remaining')}</span>
                  <span>
                    {current
                      ? Math.max(
                          0,
                          current.participantTarget - current.participants
                        )
                      : '—'}
                  </span>
                </div>
              </div>
              <dl className='mt-auto space-y-3 text-xs'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <dt className='text-muted-foreground'>{tr('eligibility')}</dt>
                  <dd>
                    {current
                      ? new Intl.NumberFormat(i18n.language, {
                          style: 'currency',
                          currency: 'CNY',
                        }).format(current.minimumRechargeCents / 100)
                      : '—'}
                  </dd>
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <dt className='text-muted-foreground'>{tr('protection')}</dt>
                  <dd className='flex items-center gap-1.5'>
                    <ShieldCheck aria-hidden='true' className='size-3.5' />
                    {current?.humanVerification
                      ? t('lottery.verificationEnabled')
                      : t('lottery.verificationOff')}
                  </dd>
                </div>
              </dl>
              <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
                <span className='text-xs text-muted-foreground'>
                  {current?.joined ? tr('joined') : ''}
                </span>
                <Button
                  disabled={!user || !current || current.joined || state.busy}
                  onClick={() => void join()}
                  className='min-w-28'
                >
                  <Sparkles aria-hidden='true' className='size-4' />
                  {tr('join')}
                </Button>
              </div>
            </div>
          </Card>
          <section aria-labelledby='recent-winners' className='min-w-0'>
            <div className='flex h-16 items-center justify-between gap-3 border-b'>
              <h2
                id='recent-winners'
                className='flex items-center gap-2 text-sm font-semibold'
              >
                <Trophy
                  aria-hidden='true'
                  className='size-4 text-muted-foreground'
                />
                {tr('recentWinners')}
              </h2>
            </div>
            <ul className='divide-y' data-testid='recent-winners-list'>
              {recentWinners.map((winner, index) => (
                <li key={winner.id} className='flex items-center gap-3 py-4'>
                  <span className='w-5 text-xs text-muted-foreground tabular-nums'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className='flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium uppercase'>
                    {winner.name.slice(0, 1)}
                  </span>
                  <span className='min-w-0 flex-1 truncate text-sm'>
                    {winner.name}
                  </span>
                  <span className='text-sm font-semibold text-badge-success-foreground tabular-nums'>
                    +{reward(winner.rewardCents)}
                  </span>
                </li>
              ))}
              {!recentWinners.length && (
                <li className='py-12 text-center text-sm text-muted-foreground'>
                  {t('data_table.no_results')}
                </li>
              )}
            </ul>
          </section>
        </div>
        <section aria-labelledby='my-winnings' className='min-w-0 space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3 border-b py-3'>
            <h2
              id='my-winnings'
              className='flex items-center gap-2 text-sm font-semibold'
            >
              <Gift
                aria-hidden='true'
                className='size-4 text-muted-foreground'
              />
              {tr('myWinnings')}
            </h2>
          </div>
          <ul
            className='grid gap-3 @2xl/lottery:grid-cols-2'
            data-testid='personal-winnings-list'
          >
            {personalWinnings.map((win) => (
              <li
                key={win.id}
                className='flex items-center justify-between gap-3 rounded-lg border px-4 py-3'
              >
                <div className='space-y-1'>
                  <p className='text-sm font-medium'>
                    {t('lottery.roundNumber', { number: win.id })}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {date(win.drawnAt)} UTC
                  </p>
                </div>
                <div className='space-y-1 text-end'>
                  <p className='text-base font-semibold text-badge-success-foreground tabular-nums'>
                    +{reward(win.rewardCents)}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {tr('credited')}
                  </p>
                </div>
              </li>
            ))}
            {!personalWinnings.length && (
              <li className='col-span-full py-8 text-center text-sm text-muted-foreground'>
                {t('data_table.no_results')}
              </li>
            )}
          </ul>
        </section>
        <section aria-labelledby='past-rounds' className='min-w-0 space-y-4'>
          <div className='border-b py-3'>
            <h2
              id='past-rounds'
              className='flex items-center gap-2 text-sm font-semibold'
            >
              <History
                aria-hidden='true'
                className='size-4 text-muted-foreground'
              />
              {tr('pastRounds')}
            </h2>
          </div>
          <RoundsTable />
        </section>
      </Main>
      <Dialog
        open={!!challenge}
        onOpenChange={(open) => {
          if (!open) setChallenge(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('verificationTitle')}</DialogTitle>
          </DialogHeader>
          {challenge && (
            <img
              width={180}
              height={55}
              alt={tr('verificationImage')}
              src={challenge.image}
            />
          )}
          <Input
            aria-label={tr('verificationAnswer')}
            value={answer}
            maxLength={6}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button
            disabled={state.busy || answer.length !== 6}
            onClick={async () => {
              if (!challenge) return
              try {
                await state.execute({
                  op: 'join_lottery',
                  round_id: challenge.round,
                  challenge_id: challenge.id,
                  answer,
                })
                setChallenge(null)
                toast.success(tr('joined'))
              } catch {
                setChallenge(null)
              }
            }}
          >
            {tr('join')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
