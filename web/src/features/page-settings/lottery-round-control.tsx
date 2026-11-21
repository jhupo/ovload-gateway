import { useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEngagement, type LotteryState } from '@/hooks/use-engagement'
import { Button } from '@/components/ui/button'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { defaultLottery } from './lottery-draft'
import { LotteryStartDialog } from './lottery-start-dialog'
import { LotteryWinnersTable } from './lottery-winners-table'

export function LotteryRoundControl() {
  const state = useEngagement<LotteryState>('lottery')
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const { t } = useTranslation()
  return (
    <>
      <ConfigurationSection
        title={t('lotterySettings.activityManagement')}
        action={
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              type='button'
              variant='outline'
              disabled={!state.data?.current || state.busy}
              onClick={() => setEnding(true)}
            >
              <Square aria-hidden='true' className='size-4' />
              {t('lotterySettings.end')}
            </Button>
          </div>
        }
      >
        <LotteryWinnersTable
          actions={
            <Button
              ref={trigger}
              size='sm'
              type='button'
              disabled={!state.data || !!state.data.current || state.busy}
              onClick={() => setStarting(true)}
            >
              <Play aria-hidden='true' className='size-4' />
              {t('lotterySettings.start')}
            </Button>
          }
        />
      </ConfigurationSection>
      {starting && (
        <LotteryStartDialog
          initial={defaultLottery()}
          onClose={() => setStarting(false)}
          restoreFocus={() => trigger.current?.focus()}
        />
      )}
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        isLoading={state.busy}
        title={t('lotterySettings.end')}
        desc={t('lottery.endDescription')}
        handleConfirm={async () => {
          if (state.data?.current) {
            try {
              await state.execute({
                op: 'end_lottery',
                round_id: state.data.current.id,
              })
              setEnding(false)
            } catch {
              /* The request hook displays the error. */
            }
          }
        }}
      />
    </>
  )
}
