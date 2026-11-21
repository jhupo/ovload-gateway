import {
  LayoutDashboard,
  ChartNoAxesCombined,
  Layers,
  Activity,
  HelpCircle,
  Settings,
  UserCog,
  Users,
  BadgeDollarSign,
  Tickets,
  Megaphone,
  Network,
  Gift,
  ShieldCheck,
  Handshake,
  UserPlus,
  Wallet,
  ReceiptText,
  CreditCard,
  SlidersHorizontal,
  PanelsTopLeft,
  ShieldUser,
  DatabaseBackup,
  HeartPulse,
  Mail,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIdentitySession } from '@/stores/identity-session'
import { canOpenManagementPath } from '@/lib/route-authority'
import { workspacePathEnabled } from '@/lib/workspace-visibility'
import { useUserWorkspace } from '@/hooks/use-user-workspace'
import { useWorkspaceVisibility } from '@/hooks/use-workspace-settings'
import { type SidebarData, type NavItem } from '../types'
import { useUserSidebarData } from './user-sidebar-data'

function filterManagementGroup(
  group: SidebarData['navGroups'][number],
  enabled: (path: string) => boolean
): SidebarData['navGroups'][number] {
  return {
    ...group,
    items: group.items.flatMap<NavItem>((item) => {
      if (item.items) {
        const items = item.items.filter(
          (child) =>
            child.url && enabled(child.url) && canOpenManagementPath(child.url)
        )
        return items.length ? [{ ...item, items }] : []
      }
      return item.url && enabled(item.url) && canOpenManagementPath(item.url)
        ? [item]
        : []
    }),
  }
}

export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const user = useUserWorkspace()
  const userSidebar = useUserSidebarData()
  const visibility = useWorkspaceVisibility()
  useIdentitySession((state) => state.grants)

  if (user) return userSidebar

  return {
    navGroups: [
      {
        title: t('sidebar.general'),
        items: [
          {
            title: t('sidebar.dashboard'),
            url: '/dashboard',
            icon: LayoutDashboard,
          },
          {
            title: t('sidebar.monitoring'),
            url: '/monitoring',
            icon: Activity,
          },
          {
            title: t('sidebar.usage'),
            url: '/usage',
            icon: ChartNoAxesCombined,
          },
          {
            title: t('sidebar.users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('sidebar.subscriptions'),
            url: '/subscriptions',
            icon: Tickets,
          },
          {
            title: t('sidebar.order_management'),
            icon: ReceiptText,
            items: [
              {
                title: t('sidebar.payment_overview'),
                url: '/orders/overview',
                icon: CreditCard,
              },
              {
                title: t('sidebar.order_management'),
                url: '/orders/records',
                icon: ReceiptText,
              },
              {
                title: t('sidebar.subscription_plans'),
                url: '/orders/plans',
                icon: Tickets,
              },
            ],
          },
          {
            title: t('sidebar.redemption_codes'),
            url: '/redemption-codes',
            icon: Gift,
          },
          {
            title: t('sidebar.groups'),
            url: '/groups',
            icon: Layers,
          },
          {
            title: t('sidebar.accounts'),
            url: '/accounts',
            icon: UserCog,
          },
          {
            title: t('sidebar.proxies'),
            url: '/proxies',
            icon: Network,
          },
          {
            title: t('sidebar.announcements'),
            url: '/announcements',
            icon: Megaphone,
          },
        ],
      },
      {
        title: t('sidebar.features'),
        items: [
          {
            title: t('sidebar.referrals'),
            icon: Handshake,
            items: [
              {
                title: t('sidebar.invitation_records'),
                url: '/referrals/invitations',
                icon: UserPlus,
              },
              {
                title: t('sidebar.rebate_records'),
                url: '/referrals/rebates',
                icon: BadgeDollarSign,
              },
              {
                title: t('sidebar.withdrawal_records'),
                url: '/referrals/withdrawals',
                icon: Wallet,
              },
            ],
          },
          {
            title: t('sidebar.security_audit'),
            icon: ShieldCheck,
            url: '/security-audit',
          },
        ],
      },
      {
        title: t('sidebar.pages'),
        items: [
          {
            title: t('sidebar.channel_status'),
            url: '/channel-status',
            icon: HeartPulse,
          },
          {
            title: t('lottery.title'),
            url: '/lottery',
            icon: Gift,
          },
        ],
      },
      {
        title: t('sidebar.other'),
        items: [
          {
            title: t('sidebar.settings'),
            icon: Settings,
            defaultOpen: true,
            items: [
              {
                title: t('generalSettings.title'),
                url: '/general-settings',
                icon: Settings,
              },
              {
                title: t('featureSettings.title'),
                url: '/feature-settings',
                icon: SlidersHorizontal,
              },
              {
                title: t('pageSettings.title'),
                url: '/page-settings',
                icon: PanelsTopLeft,
              },
              {
                title: t('securityAuthentication.title'),
                url: '/security-authentication',
                icon: ShieldUser,
              },
              {
                title: t('mailSettings.title'),
                url: '/mail-settings',
                icon: Mail,
              },
              {
                title: t('paymentSettings.title'),
                url: '/payment-settings',
                icon: CreditCard,
              },
              {
                title: t('gatewaySettings.title'),
                url: '/gateway-settings',
                icon: Network,
              },
              {
                title: t('dataBackup.title'),
                url: '/data-backup',
                icon: DatabaseBackup,
              },
            ],
          },
          {
            title: t('sidebar.help_center'),
            url: '/help-center',
            icon: HelpCircle,
          },
        ],
      },
    ]
      .map((group) =>
        filterManagementGroup(group, (path) =>
          workspacePathEnabled(path, visibility.data)
        )
      )
      .filter((group) => group.items.length > 0),
  }
}
