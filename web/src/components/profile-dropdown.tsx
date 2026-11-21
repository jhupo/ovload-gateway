import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import useDialogState from '@/hooks/use-dialog-state'
import { useUserWorkspace } from '@/hooks/use-user-workspace'
import { useWorkspaceProfile } from '@/hooks/use-workspace-profile'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { ProfileAvatar } from '@/features/settings/profile/profile-avatar'

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const { t } = useTranslation()
  const { profile: previewProfile } = useWorkspaceProfile()
  const user = useUserWorkspace()

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='group relative size-9 rounded-full p-0 transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-accent hover:ring-4 hover:ring-accent/60 focus-visible:ring-ring/50 active:scale-95 data-[state=open]:bg-accent data-[state=open]:ring-4 data-[state=open]:ring-accent/60 motion-reduce:transform-none motion-reduce:transition-none'
            aria-label={t(
              user ? 'userWorkspace.account' : 'admin.administrator'
            )}
          >
            <ProfileAvatar
              username={previewProfile.username}
              avatar={previewProfile.avatar}
              className='size-8 transition-transform duration-200 ease-out group-hover:scale-105 group-data-[state=open]:scale-105 motion-reduce:transform-none motion-reduce:transition-none'
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-1.5'>
              <div className='flex min-w-0 items-center gap-2'>
                <p className='min-w-0 text-sm leading-tight font-medium break-all'>
                  {previewProfile.username}
                </p>
              </div>
              <p className='text-xs leading-tight break-all text-muted-foreground'>
                {previewProfile.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to={user ? '/user/settings' : '/settings'}>
                {t('profile_dropdown.profile')}
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={user ? '/user/orders' : '/orders/records'}>
                {t('userWorkspace.orders')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild={user} disabled={!user}>
              {user ? (
                <Link to='/user/api-keys'>
                  {t('profile_dropdown.model_keys')}
                </Link>
              ) : (
                t('profile_dropdown.model_keys')
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            {t('profile_dropdown.sign_out')}
            <DropdownMenuShortcut className='text-current'>
              ⇧⌘Q
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
