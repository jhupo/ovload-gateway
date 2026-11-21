import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, Ellipsis, History, Pencil, UserCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { customersApi } from '@/api/customers'
import { allows, useIdentitySession } from '@/stores/identity-session'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RequestErrorToast } from '@/components/request-error-toast'
import { useUsersActions } from '../context'
import { type User } from '../data/schema'
import { UserBalanceDialog } from './user-balance'
import { UserEditor } from './user-editor'
import { UserIdentity } from './user-identity'

export function UserActions({ user }: { user: User }) {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<'edit' | 'status' | 'history' | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogPending = useRef(false)
  const actions = useUsersActions()
  const userId = user.id
  const tenantId = user.tenantId
  const profile = useQuery({
    queryKey: ['customer-lifecycle', actions.owner, tenantId, userId],
    queryFn: ({ signal }) =>
      customersApi.get({ id: userId, tenant_id: tenantId }, signal),
    enabled: panel === 'status' && actions.canManage(user.tenantId),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const status =
    panel === 'status' && !profile.isFetching
      ? (profile.data?.data.status ?? user.status)
      : user.status
  const disabled = status === 'suspended'
  const statusAction = t(disabled ? 'users.enable' : 'users.disable')
  const StatusIcon = disabled ? UserCheck : Ban
  const restoreFocus = () => {
    dialogPending.current = false
    trigger.current?.focus()
  }
  async function lifecycle() {
    if (
      actions.pending ||
      profile.isFetching ||
      !profile.data?.etag ||
      status === 'revoked'
    )
      return
    const owner = actions.owner
    try {
      await actions.setActive(profile.data.data, profile.data.etag, disabled)
      if (useIdentitySession.getState().session?.id !== owner) return
      setPanel(null)
      toast.success(t('identity.saved'))
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    }
  }
  return (
    <div className='flex justify-start'>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant='ghost'
            size='icon'
            className='size-9 shadow-none data-[state=open]:bg-muted'
            aria-label={t('users.actions_for', { name: user.username })}
          >
            <Ellipsis className='size-4' aria-hidden='true' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          className='min-w-36'
          onCloseAutoFocus={(event) => {
            if (dialogPending.current) event.preventDefault()
          }}
        >
          <DropdownMenuItem
            disabled={actions.pending || !actions.canManage(user.tenantId)}
            onSelect={() => {
              dialogPending.current = true
              setPanel('edit')
            }}
          >
            <Pencil className='size-4' />
            {t('users.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!allows('billing.read', user.tenantId)}
            onSelect={() => {
              dialogPending.current = true
              setPanel('history')
            }}
          >
            <History className='size-4' />
            {t('users.credit_history')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              actions.pending ||
              user.status === 'revoked' ||
              !actions.canManage(user.tenantId)
            }
            variant={disabled ? 'default' : 'destructive'}
            onSelect={() => {
              dialogPending.current = true
              setPanel('status')
            }}
          >
            <StatusIcon className='size-4' />
            {statusAction}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {panel === 'edit' && (
        <UserEditor
          user={user}
          onClose={() => setPanel(null)}
          restoreFocus={restoreFocus}
        />
      )}
      {panel === 'history' && (
        <UserBalanceDialog
          user={user}
          onClose={() => setPanel(null)}
          restoreFocus={restoreFocus}
        />
      )}
      <AlertDialog
        open={panel === 'status'}
        onOpenChange={(open) => {
          if (!open && !actions.pending) setPanel(null)
        }}
      >
        <AlertDialogContent
          className='sm:max-w-md'
          onEscapeKeyDown={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <AlertDialogHeader className='text-start'>
            <AlertDialogTitle className='flex items-center gap-3'>
              {statusAction}
            </AlertDialogTitle>
            <AlertDialogDescription className='sr-only'>
              {statusAction} · {user.username}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='rounded-lg border p-3'>
            <UserIdentity user={user} />
          </div>
          {profile.isError && (
            <RequestErrorToast
              message={profile.error.message}
              retry={() => void profile.refetch()}
            />
          )}
          {profile.isPending && (
            <div role='status' className='text-sm text-muted-foreground'>
              {t('identity.loading')}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.pending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                actions.pending ||
                profile.isFetching ||
                !profile.data?.etag ||
                status === 'revoked' ||
                !actions.canManage(user.tenantId)
              }
              onClick={(event) => {
                event.preventDefault()
                void lifecycle()
              }}
            >
              {statusAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
