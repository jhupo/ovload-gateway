import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { useIdentitySession } from '@/stores/identity-session'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const [pending, setPending] = useState(false)
  const { t } = useTranslation()

  const handleSignOut = async () => {
    const session = useIdentitySession.getState().session
    if (!session || pending) return
    setPending(true)
    try {
      await apiRequest(session.audience, '/auth/session', { method: 'DELETE' })
      if (useIdentitySession.getState().session?.id !== session.id) return
      onOpenChange(false)
      useIdentitySession.getState().clear()
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== session.id) return
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sign_out.title')}
      desc={t('sign_out.desc')}
      confirmText={t('sign_out.confirm')}
      destructive
      isLoading={pending}
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
