import { Link } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useErrorToast } from '@/hooks/use-error-toast'
import { useSiteIdentity } from '@/hooks/use-site-identity'
import { useUserWorkspace } from '@/hooks/use-user-workspace'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '../ui/button'

export function AppTitle() {
  const { t } = useTranslation()
  const { setOpenMobile } = useSidebar()
  const user = useUserWorkspace()
  const identity = useSiteIdentity()
  useErrorToast(
    identity.isError ? t('siteIdentity.unavailable') : undefined,
    'site-identity'
  )
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='gap-0 py-0 hover:bg-transparent active:bg-transparent'
          asChild
        >
          <div>
            <Link
              to={user ? '/user/dashboard' : '/dashboard'}
              onClick={() => setOpenMobile(false)}
              className='flex min-w-0 flex-1 items-center gap-2 text-start text-sm leading-tight'
              title={identity.data?.name}
            >
              {identity.data?.logo_url && (
                <img
                  src={identity.data.logo_url}
                  alt=''
                  className='size-8 shrink-0 rounded-md object-contain'
                  width={32}
                  height={32}
                />
              )}
              <span className='grid min-w-0 flex-1'>
                <span className='truncate font-bold'>
                  {identity.data?.name ??
                    (identity.isPending ? (
                      <span
                        className='block h-4 w-24 animate-pulse rounded bg-muted'
                        role='status'
                        aria-label={t('siteIdentity.loading')}
                      />
                    ) : null)}
                </span>
                {identity.data?.subtitle && (
                  <span
                    className='truncate text-xs'
                    title={identity.data.subtitle}
                  >
                    {identity.data.subtitle}
                  </span>
                )}
              </span>
            </Link>
            <ToggleSidebar />
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function ToggleSidebar({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar='trigger'
      data-slot='sidebar-trigger'
      variant='ghost'
      size='icon'
      className={cn('aspect-square size-8 max-md:scale-125', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <X className='md:hidden' />
      <Menu className='max-md:hidden' />
      <span className='sr-only'>Toggle Sidebar</span>
    </Button>
  )
}
