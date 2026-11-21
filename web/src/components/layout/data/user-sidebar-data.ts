import {
  ChartNoAxesCombined,
  CreditCard,
  Gift,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Settings,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { workspacePathEnabled } from '@/lib/workspace-visibility'
import { useWorkspaceVisibility } from '@/hooks/use-workspace-settings'
import { useUserSettingsItems } from '@/features/settings/navigation'
import type { SidebarData } from '../types'

export function useUserSidebarData(): SidebarData {
  const { t } = useTranslation()
  const settingsItems = useUserSettingsItems()
  const visibility = useWorkspaceVisibility()
  return {
    navGroups: [
      {
        title: t('sidebar.general'),
        items: [
          {
            title: t('sidebar.dashboard'),
            url: '/user/dashboard',
            icon: LayoutDashboard,
          },
          {
            title: t('userWorkspace.apiKeys'),
            url: '/user/api-keys',
            icon: KeyRound,
          },
          {
            title: t('userWorkspace.usage'),
            url: '/user/usage',
            icon: ChartNoAxesCombined,
          },
          {
            title: t('userWorkspace.recharge'),
            url: '/user/recharge',
            icon: CreditCard,
          },
        ],
      },
      {
        title: t('sidebar.pages'),
        items: [
          {
            title: t('sidebar.channel_status'),
            url: '/user/channel-status',
            icon: HeartPulse,
          },
          { title: t('lottery.title'), url: '/user/lottery', icon: Gift },
        ],
      },
      {
        title: t('sidebar.other'),
        items: [
          {
            title: t('sidebar.settings'),
            icon: Settings,
            defaultOpen: true,
            items: settingsItems.map(({ label, ...item }) => ({
              ...item,
              title: label,
            })),
          },
        ],
      },
    ]
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            !('url' in item) ||
            workspacePathEnabled(item.url as string, visibility.data)
        ),
      }))
      .filter((group) => group.items.length > 0),
  }
}
