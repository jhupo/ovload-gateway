import { useState, type ReactNode } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { hasIdentitySession } from '@/stores/identity-session'
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

export function AccountDialog({
  title,
  dirty,
  pending,
  form,
  onClose,
  children,
  submitText,
  pendingText,
  cancelText,
  onBack,
}: {
  title: string
  dirty: boolean
  pending: boolean
  form: string
  onClose: () => void
  children: ReactNode
  submitText?: string
  pendingText?: string
  cancelText?: string
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const [discard, setDiscard] = useState(false)
  const blocker = useBlocker({
    shouldBlockFn: () => (dirty || pending) && hasIdentitySession(),
    enableBeforeUnload: dirty || pending,
    withResolver: true,
  })
  const close = () => {
    if (!pending) {
      if (dirty) setDiscard(true)
      else onClose()
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
          className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl'
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (pending || dirty) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className='sr-only'>{title}</DialogDescription>
          </DialogHeader>
          <div
            data-account-dialog-body
            className='min-h-0 overflow-y-auto pr-1'
          >
            {children}
          </div>
          <DialogFooter>
            {onBack && (
              <Button
                type='button'
                variant='ghost'
                disabled={pending}
                onClick={onBack}
              >
                {tr('previousStep')}
              </Button>
            )}
            <Button variant='outline' disabled={pending} onClick={close}>
              {tr(cancelText ?? 'cancel')}
            </Button>
            <Button type='submit' form={form} disabled={pending}>
              {tr(pending ? (pendingText ?? 'saving') : (submitText ?? 'save'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard || blocker.status === 'blocked'}
        disabled={pending}
        onOpenChange={(open) => {
          if (!open) {
            setDiscard(false)
            if (blocker.status === 'blocked') blocker.reset()
          }
        }}
        title={tr('discard')}
        desc={tr('discardConfirmation')}
        destructive
        handleConfirm={() => {
          if (pending) return
          if (blocker.status === 'blocked') blocker.proceed()
          else onClose()
        }}
      />
    </>
  )
}
