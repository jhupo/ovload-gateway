import { useState } from 'react'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { roleValues, type UserRole } from '../data/schema'

export function UsersInviteDialog({
  onClose,
  restoreFocus,
}: {
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [notes, setNotes] = useState('')
  const dirty = email !== '' || role !== 'user' || notes !== ''
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-md'
        onEscapeKeyDown={(event) => {
          if (dirty) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (dirty) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle className='flex items-center gap-3'>
            {t('users.invite')}
            <Badge variant='secondary' className='font-normal'>
              {t('users.unavailable')}
            </Badge>
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('users.invite')} · {t('users.unavailable')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => event.preventDefault()}
        >
          <div className='space-y-2'>
            <Label htmlFor='invite-email'>{t('users.email')}</Label>
            <Input
              id='invite-email'
              name='email'
              type='email'
              autoComplete='off'
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='invite-role'>{t('users.role')}</Label>
            <Select
              value={role}
              onValueChange={(value: UserRole) => setRole(value)}
            >
              <SelectTrigger id='invite-role' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`users.roles.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='invite-notes'>{t('users.notes')}</Label>
            <Textarea
              id='invite-notes'
              name='notes'
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              className='min-h-24'
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type='submit' disabled>
              {t('users.send_invite')}
              <Send className='size-4' aria-hidden='true' />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
