import { Outlet } from '@tanstack/react-router'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Header } from './header'

export function UserLayout() {
  return (
    <>
      <Header
        fixed
        className='bg-background'
        data-testid='user-workspace-header'
      >
        <ProfileDropdown />
      </Header>
      <Outlet />
    </>
  )
}
