import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'

export function Editor({
  title,
  dirty,
  children,
  onClose,
  restoreFocus,
  action,
  onSave,
  busy = false,
}: {
  title: string
  dirty: boolean
  children: ReactNode
  onClose: () => void
  restoreFocus: () => void
  action: string
  onSave: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const [discard, setDiscard] = useState(false)
  const close = () => (dirty ? setDiscard(true) : onClose())
  useEffect(() => {
    if (!dirty) return
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
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
          className='flex max-h-[100dvh] max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl sm:rounded-xl'
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault()
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 border-b px-5 py-4 text-left sm:px-6'>
            <div className='flex items-center gap-3 pr-9'>
              <DialogTitle>{title}</DialogTitle>
            </div>
            <DialogDescription className='sr-only'>{title}</DialogDescription>
            <Button
              variant='ghost'
              size='icon'
              className='absolute top-2 right-3'
              aria-label={t('common.close')}
              onClick={close}
            >
              <X />
            </Button>
          </DialogHeader>
          <form
            id='subscription-editor'
            className='min-h-0 overflow-y-auto px-5 py-5 sm:px-6'
            onSubmit={(e) => {
              e.preventDefault()
              if (!busy) onSave()
            }}
          >
            <fieldset disabled={busy}>{children}</fieldset>
          </form>
          <DialogFooter className='shrink-0 flex-row justify-end border-t bg-background px-5 py-4 sm:px-6'>
            <Button variant='outline' onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type='submit' form='subscription-editor' disabled={busy}>
              {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t('subscriptions.discard')}
        desc={
          <span className='sr-only'>
            {t('subscriptions.discardDescription')}
          </span>
        }
        confirmText={t('subscriptions.discardAction')}
        handleConfirm={() => {
          setDiscard(false)
          onClose()
        }}
      />
    </>
  )
}
