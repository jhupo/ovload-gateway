import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUserWorkspace } from '@/hooks/use-user-workspace'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SettingsTabs } from '@/components/settings-tabs'
import { SettingsActionTargetContext } from './action-target'
import { useUserSettingsItems } from './navigation'

export function Settings() {
  const { t } = useTranslation()
  const user = useUserWorkspace()
  const userSettingsItems = useUserSettingsItems()
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const active =
    userSettingsItems.find(
      (item) => pathname === item.url || pathname === `${item.url}/`
    )?.id ?? 'profile'
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null)
  return (
    <SettingsActionTargetContext value={actionTarget}>
      {!user && (
        <Header fixed className='bg-background'>
          <ProfileDropdown />
        </Header>
      )}
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='grid min-w-0 shrink-0 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]'
        >
          <div className='flex min-w-0 flex-wrap items-center gap-3'>
            <h1 className='text-2xl font-semibold'>
              {t('personalProfile.settingsTitle')}
            </h1>
          </div>
          <div
            ref={setActionTarget}
            className='ms-auto flex min-h-9 shrink-0 gap-2'
          />
        </div>
        <SettingsTabs
          value={user ? active : 'profile'}
          onValueChange={(value) => {
            const item = userSettingsItems.find((entry) => entry.id === value)
            if (user && item) void navigate({ to: item.url })
          }}
          label={t('personalProfile.settingsTitle')}
          items={
            user
              ? userSettingsItems
              : [
                  {
                    id: 'profile',
                    label: t('personalProfile.title'),
                    icon: UserRound,
                  },
                ]
          }
        >
          <Outlet />
        </SettingsTabs>
      </Main>
    </SettingsActionTargetContext>
  )
}
