import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useIdentitySession } from '@/stores/identity-session'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { UsersPrimaryButtons } from './components/users-primary-buttons'
import { UsersTable } from './components/users-table'
import { UsersProvider } from './provider'

const route = getRouteApi('/_authenticated/users/')

export function Users() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const session = useIdentitySession((state) => state.session)
  const owner = session?.audience === 'management' ? session.id : undefined
  return (
    <UsersProvider key={owner ?? 'signed-out'} owner={owner}>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 flex-wrap items-center justify-between gap-4'
        >
          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('users.title')}
            </h1>
          </div>
          <UsersPrimaryButtons />
        </div>
        <UsersTable search={search} navigate={navigate} />
      </Main>
    </UsersProvider>
  )
}
