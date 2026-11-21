import { useQuery } from '@tanstack/react-query'
import { getWalletBalance } from '@/api/wallet'
import { useIdentitySession } from '@/stores/identity-session'

export function useWallet() {
  const session = useIdentitySession((state) => state.session)
  return useQuery({
    queryKey: ['customer-wallet', session?.id],
    queryFn: ({ signal }) => getWalletBalance(signal),
    enabled: session?.audience === 'customer',
    retry: false,
  })
}
