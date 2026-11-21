import { useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEngagement, type LotteryState } from '@/hooks/use-engagement'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { lotteryErrors, usdCents, type LotteryDraft } from './lottery-draft'
import { LotteryRuleFields } from './lottery-rule-fields'

export function LotteryStartDialog({
  initial,
  onClose,
  restoreFocus,
}: {
  initial: LotteryDraft
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const [rules, setRules] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const state = useEngagement<LotteryState>('lottery')
  const key = useRef(crypto.randomUUID())
  const [discard, setDiscard] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(rules) !== JSON.stringify(initial)
  const close = () => (dirty ? setDiscard(true) : onClose())
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 border-b px-5 py-4 text-start sm:px-6'>
            <div className='flex items-center justify-between gap-3'>
              <DialogTitle>{t('lotterySettings.start')}</DialogTitle>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-8 shrink-0 text-muted-foreground'
                aria-label={t('common.close')}
                onClick={close}
              >
                <X aria-hidden='true' className='size-4' />
              </Button>
            </div>
            <DialogDescription className='sr-only'>
              {t('lotterySettings.startDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            ref={formRef}
            noValidate
            className='flex min-h-0 flex-1 flex-col'
            onSubmit={async (event) => {
              event.preventDefault()
              const validation = lotteryErrors(rules)
              setErrors(validation)
              if (Object.keys(validation).length || state.busy) return
              try {
                await state.execute({
                  op: 'start_lottery',
                  key: key.current,
                  reward_cents: usdCents(rules.reward),
                  winner_count: Number(rules.winnerCount),
                  participant_target: Number(rules.participantTarget),
                  minimum_recharge_cents: usdCents(rules.minimumRecharge),
                  human_verification: rules.humanVerification,
                })
                onClose()
              } catch {
                /* The request hook displays the error. */
              }
            }}
          >
            <div className='min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6'>
              <fieldset disabled={state.busy} className='min-w-0'>
                <LotteryRuleFields
                  value={rules}
                  errors={errors}
                  onChange={(value) => {
                    setRules(value)
                    setErrors({})
                    key.current = crypto.randomUUID()
                  }}
                />
              </fieldset>
            </div>
            <DialogFooter className='shrink-0 flex-row items-center justify-between border-t px-5 py-4 sm:justify-between sm:px-6'>
              <div className='flex gap-2'>
                <Button type='button' variant='outline' onClick={close}>
                  {t('common.cancel')}
                </Button>
                <Button type='submit' disabled={state.busy}>
                  <Play aria-hidden='true' className='size-4' />
                  {t('lotterySettings.confirmStart')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t('generalSettings.discard')}
        desc={<span className='sr-only'>{t('generalSettings.discard')}</span>}
        cancelBtnText={t('generalSettings.cancel')}
        confirmText={t('generalSettings.discardAction')}
        handleConfirm={onClose}
      />
    </>
  )
}
