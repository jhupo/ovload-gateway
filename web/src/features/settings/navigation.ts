import { Gift, Handshake, ReceiptText, Tickets, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceVisibility } from '@/hooks/use-workspace-settings'

export function useUserSettingsItems() {
  const { t } = useTranslation()
  const visibility = useWorkspaceVisibility()
  return [
    {
      id: 'profile',
      label: t('personalProfile.title'),
      url: '/user/settings',
      icon: UserRound,
    },
    {
      id: 'subscriptions',
      label: t('userWorkspace.subscriptions'),
      url: '/user/subscriptions',
      icon: Tickets,
    },
    {
      id: 'orders',
      label: t('userWorkspace.orders'),
      url: '/user/orders',
      icon: ReceiptText,
    },
    {
      id: 'redeem',
      label: t('userWorkspace.redeem'),
      url: '/user/redeem',
      icon: Gift,
    },
    {
      id: 'referrals',
      label: t('sidebar.referrals'),
      url: '/user/referrals',
      icon: Handshake,
    },
  ].filter(
    (item) => item.id !== 'referrals' || visibility.data?.referral === true
  )
}
