import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSettingsUsers } from '@/hooks/use-settings-options'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { UserIdentity } from '@/features/users/components/user-identity'
import {
  normalizeUserOffer,
  userOfferErrors,
  type PaymentErrors,
  type UserOffer,
} from './draft'
import { PaymentField } from './fields'

export function UserOfferEditor({
  initial,
  existing,
  entries,
  onSave,
  onClose,
  restoreFocus,
  onDirtyChange,
}: {
  initial: UserOffer
  existing: boolean
  entries: UserOffer[]
  onSave: (value: UserOffer) => void
  onClose: () => void
  restoreFocus: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const users = useSettingsUsers()
  const tr = (key: string) => t('paymentSettings.' + key)
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<PaymentErrors>({})
  const [discard, setDiscard] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const discarded = useRef(false)
  const id = useId()
  const selected = users.find((user) => user.id === draft.userId)
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  function update(key: 'userId' | 'amount' | 'percent', value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors({})
  }
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
          className='max-h-[85dvh] overflow-y-auto sm:max-w-lg'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {tr(existing ? 'editUserOffer' : 'addUserOffer')}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('userOfferDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            ref={form}
            id='payment-user-offer-editor'
            noValidate
            className='space-y-5'
            onSubmit={(event) => {
              event.preventDefault()
              const next = userOfferErrors(draft, entries)
              setErrors(next)
              const first = Object.keys(next)[0]
              if (first) {
                toast.error(tr(next[first]!), {
                  id: 'payment-user-offer-validation',
                })
                requestAnimationFrame(() =>
                  form.current
                    ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                    ?.focus()
                )
                return
              }
              onSave(normalizeUserOffer(draft))
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor={id}>{tr('user')}</Label>
              <Popover modal open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={id}
                    type='button'
                    variant='outline'
                    role='combobox'
                    aria-expanded={pickerOpen}
                    aria-invalid={!!errors.userId}
                    aria-describedby={errors.userId ? id + '-error' : undefined}
                    className='h-9 w-full min-w-0 justify-between'
                  >
                    <span className='truncate'>
                      {selected?.username ?? tr('selectUser')}
                    </span>
                    <ChevronsUpDown
                      aria-hidden='true'
                      className='size-4 shrink-0 opacity-50'
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align='start'
                  className='w-[var(--radix-popover-trigger-width)] p-0'
                >
                  <Command>
                    <CommandInput
                      aria-label={tr('searchUsers')}
                      placeholder={tr('searchUsers')}
                    />
                    <CommandList className='max-h-[min(13rem,calc(var(--radix-popover-content-available-height)-3rem))] overscroll-contain'>
                      <CommandEmpty>{tr('noMatches')}</CommandEmpty>
                      <CommandGroup>
                        {users
                          .filter(
                            (user) =>
                              !entries.some(
                                (row) =>
                                  row.id !== draft.id && row.userId === user.id
                              )
                          )
                          .map((user) => (
                            <CommandItem
                              key={user.id}
                              value={`${user.id} ${user.username} ${user.email}`}
                              onSelect={() => {
                                update('userId', user.id)
                                setPickerOpen(false)
                              }}
                            >
                              <div className='min-w-0 flex-1'>
                                <UserIdentity user={user} />
                              </div>
                              {draft.userId === user.id && (
                                <Check aria-hidden='true' className='size-4' />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.userId && (
                <span id={id + '-error'} className='sr-only'>
                  {tr(errors.userId)}
                </span>
              )}
            </div>
            <div className='grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2'>
              <PaymentField
                name='amount'
                label={tr('tierAmount')}
                value={draft.amount}
                numeric
                maxLength={24}
                error={errors.amount}
                onChange={(value) => update('amount', value)}
              />
              <PaymentField
                name='percent'
                label={tr('bonusPercent')}
                value={draft.percent}
                numeric
                maxLength={24}
                error={errors.percent}
                onChange={(value) => update('percent', value)}
              />
            </div>
          </form>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={close}>
              {tr('cancel')}
            </Button>
            <Button type='submit' form='payment-user-offer-editor'>
              {tr('applyOffer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={tr('discardTitle')}
        desc={tr('discardEditor')}
        confirmText={tr('discard')}
        onCloseAutoFocus={(event) => {
          if (discarded.current) {
            event.preventDefault()
            requestAnimationFrame(restoreFocus)
          }
        }}
        handleConfirm={() => {
          discarded.current = true
          setDiscard(false)
          onClose()
        }}
      />
    </>
  )
}
