import { useRef, useState } from 'react'
import { MailPlus, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useUsersActions } from '../context'
import { UserEditor } from './user-editor'
import { UsersInviteDialog } from './users-invite-dialog'

export function UsersPrimaryButtons() {
  const { t } = useTranslation()
  const { canManage, pending } = useUsersActions()
  const [open, setOpen] = useState<'invite' | 'add' | null>(null)
  const inviteTrigger = useRef<HTMLButtonElement>(null)
  const addTrigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <div className='flex gap-2'>
        <Button
          ref={inviteTrigger}
          variant='outline'
          className='space-x-1'
          disabled={pending}
          onClick={() => setOpen('invite')}
        >
          <span>{t('users.invite')}</span>
          <MailPlus size={18} aria-hidden='true' />
        </Button>
        <Button
          ref={addTrigger}
          className='space-x-1'
          disabled={pending || !canManage()}
          onClick={() => setOpen('add')}
        >
          <span>{t('users.add')}</span>
          <UserPlus size={18} aria-hidden='true' />
        </Button>
      </div>
      {open === 'invite' && (
        <UsersInviteDialog
          onClose={() => setOpen(null)}
          restoreFocus={() => inviteTrigger.current?.focus()}
        />
      )}
      {open === 'add' && (
        <UserEditor
          onClose={() => setOpen(null)}
          restoreFocus={() => addTrigger.current?.focus()}
        />
      )}
    </>
  )
}
