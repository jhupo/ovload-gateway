import { useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { validateWalletCredit } from '@/api/management-wallet'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { formatUsd, parseUsd } from '@/lib/usd'
import { useCreditUserWallet, useUserWallet } from '@/hooks/use-user-wallet'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useUsersActions } from '../context'
import { type User } from '../data/schema'
import { UserIdentity } from './user-identity'

export function UserRechargeDialog({
  user,
  onClose,
  restoreFocus,
}: {
  user: User
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t, i18n } = useTranslation()
  const credit = useCreditUserWallet(user.tenantId)
  const [draftAmount, setAmount] = useState('')
  const [draftNotes, setNotes] = useState('')
  const [paidCny, setPaidCny] = useState('')
  const amount = credit.pendingInput?.amountUsd ?? draftAmount
  const notes = credit.pendingInput?.reason ?? draftNotes
  const [invalid, setInvalid] = useState<'amount' | 'reason' | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const amountInput = useRef<HTMLInputElement>(null)
  const reasonInput = useRef<HTMLTextAreaElement>(null)
  const { owner } = useUsersActions()
  const wallet = useUserWallet(user.tenantId)
  const dirty =
    !credit.pendingInput && (amount !== '' || notes !== '' || paidCny !== '')
  const fieldsLocked = credit.isPending || !!credit.pendingInput
  const balance = formatUsd(wallet.data?.available_usd, i18n.language)
  function close() {
    if (credit.isPending) return
    if (dirty) setDiscardOpen(true)
    else onClose()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (credit.isPending || !allows('billing.manage', user.tenantId)) return
    const paid = credit.pendingInput?.paidCny ?? paidCny
    if (paid && (!/^\d{1,8}(?:\.\d{1,2})?$/.test(paid) || Number(paid) <= 0)) {
      toast.error(t('identity.errors.invalid_input'))
      return
    }
    const input = {
      amountUsd: amount,
      reason: notes,
      paidCny: paid || undefined,
    }
    try {
      validateWalletCredit(input)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('identity.errors.invalid_input'),
        { id: 'user-credit-validation' }
      )
      const parsed = parseUsd(amount)
      if (parsed === null || parsed <= 0n) {
        setInvalid('amount')
        amountInput.current?.focus()
      } else {
        setInvalid('reason')
        reasonInput.current?.focus()
      }
      return
    }
    setInvalid(null)
    try {
      await credit.submit(input)
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.success(t('identity.saved'))
      onClose()
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    }
  }
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
          className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md'
          onEscapeKeyDown={(event) => {
            if (dirty || credit.isPending) {
              event.preventDefault()
              close()
            }
          }}
          onInteractOutside={(event) => {
            if (dirty || credit.isPending) {
              event.preventDefault()
              close()
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 border-b px-5 py-5 text-start sm:px-6'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0 space-y-2'>
                <DialogTitle>{t('users.recharge')}</DialogTitle>
                <p className='truncate text-xs text-muted-foreground'>
                  ID {user.id} · {user.email}
                </p>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='-me-2 -mt-1 size-8 shrink-0 text-muted-foreground shadow-none'
                aria-label={t('common.close')}
                onClick={close}
                disabled={credit.isPending}
              >
                <X className='size-4' aria-hidden='true' />
              </Button>
            </div>
            <DialogDescription className='sr-only'>
              {t('users.balance_for', { name: user.username })}
            </DialogDescription>
          </DialogHeader>
          <form
            className='flex min-h-0 flex-1 flex-col'
            onSubmit={(event) => void submit(event)}
          >
            <div className='min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6'>
              <div className='flex min-w-0 items-center justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                  <UserIdentity user={user} />
                </div>
                <span className='max-w-[45%] text-end text-xs font-medium break-all tabular-nums'>
                  {balance}
                </span>
              </div>
              <div className='space-y-2'>
                <Label htmlFor={'amount-' + user.id}>{t('users.amount')}</Label>
                <Input
                  ref={amountInput}
                  id={'amount-' + user.id}
                  name='amount'
                  inputMode='decimal'
                  autoComplete='off'
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value)
                    setInvalid(null)
                  }}
                  maxLength={21}
                  disabled={fieldsLocked}
                  aria-invalid={invalid === 'amount' || undefined}
                  aria-describedby={
                    invalid === 'amount' ? `credit-error-${user.id}` : undefined
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor={'credit-notes-' + user.id}>
                  {t('users.notes')}
                </Label>
                <Textarea
                  ref={reasonInput}
                  id={'credit-notes-' + user.id}
                  name='notes'
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value)
                    setInvalid(null)
                  }}
                  maxLength={512}
                  disabled={fieldsLocked}
                  aria-invalid={invalid === 'reason' || undefined}
                  aria-describedby={
                    invalid === 'reason' ? `credit-error-${user.id}` : undefined
                  }
                  className='min-h-24 resize-y'
                />
              </div>
              {invalid && (
                <span id={`credit-error-${user.id}`} className='sr-only'>
                  {t('identity.errors.invalid_input')}
                </span>
              )}
              <div className='space-y-2'>
                <Label htmlFor={`paid-cny-${user.id}`}>
                  {t('personalReferrals.paidCny')}
                </Label>
                <Input
                  id={`paid-cny-${user.id}`}
                  inputMode='decimal'
                  value={credit.pendingInput?.paidCny ?? paidCny}
                  onChange={(e) => setPaidCny(e.target.value)}
                  disabled={fieldsLocked}
                  maxLength={11}
                />
                <p className='text-xs text-muted-foreground'>
                  {t('personalReferrals.paidCnyHelp')}
                </p>
              </div>
              {credit.awaitingConfirmation && (
                <div role='status' className='text-sm text-muted-foreground'>
                  {t('users.credit_retry_required')}
                </div>
              )}
            </div>
            <DialogFooter className='shrink-0 flex-row items-center justify-between gap-3 border-t bg-muted/25 px-5 py-4 sm:justify-between sm:px-6'>
              <span className='text-[11px] whitespace-nowrap text-muted-foreground'>
                $
              </span>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={close}
                  disabled={credit.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type='submit'
                  disabled={
                    credit.isPending || !allows('billing.manage', user.tenantId)
                  }
                >
                  {t('users.recharge')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('generalSettings.discard')}
        desc={<span className='sr-only'>{t('generalSettings.discard')}</span>}
        confirmText={t('generalSettings.discardAction')}
        handleConfirm={onClose}
      />
    </>
  )
}
