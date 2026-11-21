import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  workspaceSettingsApi,
  type PageSettingsValues,
} from '@/api/workspace-settings'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { accountProviderLabel } from '@/lib/upstream-platforms'
import { useUserWorkspace } from '@/hooks/use-user-workspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import {
  groupStatusSections,
  loadStatusGroups,
  statusWindows,
  type StatusWindow,
} from './data'
import { StatusCard } from './status-card'

export function ChannelStatus() {
  const { t } = useTranslation()
  const user = useUserWorkspace()
  const session = useIdentitySession((state) => state.session)
  const grants = useIdentitySession((state) => state.grants)
  const [window, setWindow] = useState<StatusWindow>('24h')
  const readable =
    session?.audience === 'customer' ||
    (session?.audience === 'management' && allows('provider_accounts.read'))
  const groups = useQuery({
    queryKey: ['channel-status-groups', session?.id, session?.audience, grants],
    queryFn: ({ signal }) => loadStatusGroups(session!.audience, signal),
    enabled: readable,
    retry: false,
  })
  const configuration = useQuery({
    queryKey: ['workspace-settings', session?.id, 'pages'],
    queryFn: ({ signal }) =>
      workspaceSettingsApi.load<PageSettingsValues>('pages', signal),
    enabled:
      session?.audience === 'management' && allows('security.settings.manage'),
  })
  const selected = configuration.data?.values.monitoring.groupIds ?? []
  const sections = groupStatusSections(
    (groups.data ?? []).filter(
      (group) => !selected.length || selected.includes(group.id)
    )
  )
  return (
    <>
      {!user && (
        <Header fixed className='bg-background'>
          <ProfileDropdown />
        </Header>
      )}
      <Main id='content' className='flex-1'>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          <div className='flex flex-wrap items-center gap-3'>
            <h1 className='text-2xl font-semibold'>
              {t('sidebar.channel_status')}
            </h1>
          </div>
        </div>
        <Card className='gap-0 overflow-hidden py-0'>
          <div className='flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5'>
            <ButtonGroup
              role='tablist'
              aria-label={t('channelStatus.window')}
              className='gap-1 bg-transparent p-0'
            >
              {statusWindows.map((value) => (
                <Button
                  key={value}
                  type='button'
                  role='tab'
                  size='sm'
                  variant='ghost'
                  aria-selected={value === window}
                  onClick={() => setWindow(value)}
                  className='h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground aria-selected:font-medium aria-selected:text-foreground'
                >
                  {t(`channelStatus.windows.${value}`)}
                </Button>
              ))}
            </ButtonGroup>
            <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
              <span>{t('channelStatus.availability')} -</span>
              <span aria-hidden>·</span>
              <span>{t('channelStatus.cacheRate')} -</span>
            </div>
          </div>
        </Card>
        <div
          className='@container/status space-y-5'
          data-testid='channel-status-groups'
        >
          {!readable && (
            <div role='alert'>{t('identity.errors.forbidden')}</div>
          )}
          {readable && groups.isError && (
            <RequestErrorToast
              message={groups.error.message}
              retry={() => void groups.refetch()}
            />
          )}
          {groups.isPending && readable && (
            <div
              role='status'
              aria-label={t('common.loading')}
              className='grid gap-4 @3xl/status:grid-cols-2 @5xl/status:grid-cols-3'
            >
              {[0, 1, 2].map((index) => (
                <div key={index} className='h-52 rounded-lg bg-muted/30' />
              ))}
            </div>
          )}
          {groups.isSuccess && !sections.length && (
            <p className='py-12 text-center text-sm text-muted-foreground'>
              {t('channelStatus.noMonitoredGroups')}
            </p>
          )}
          {sections.map(({ provider, rows }) => (
            <section key={provider} aria-labelledby={'platform-' + provider}>
              <div className='mb-4 border-b py-3'>
                <div className='flex items-center gap-2'>
                  <Layers
                    aria-hidden
                    className='size-4 text-muted-foreground'
                  />
                  <h2
                    id={'platform-' + provider}
                    className='text-sm font-semibold'
                  >
                    {user
                      ? t('channelStatus.groupStatus')
                      : provider === 'unassigned' || provider === 'mixed'
                        ? t('channelStatus.' + provider)
                        : accountProviderLabel(provider)}
                  </h2>
                  <Badge
                    variant='outline'
                    className='h-5 px-1.5 text-xs font-normal text-muted-foreground'
                  >
                    {rows.length}
                  </Badge>
                </div>
              </div>
              <div className='grid gap-4 @3xl/status:grid-cols-2 @5xl/status:grid-cols-3'>
                {rows.map((group) => (
                  <StatusCard key={group.id} group={group} window={window} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Main>
    </>
  )
}
