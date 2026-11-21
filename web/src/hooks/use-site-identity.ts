import { useQuery, type QueryClient } from '@tanstack/react-query'
import { siteSettingsApi, type SiteSettings } from '@/api/site-settings'

const siteIdentityKey = ['site-settings', 'public'] as const

export function publishSiteIdentity(client: QueryClient, value: SiteSettings) {
  client.setQueryData<SiteSettings>(siteIdentityKey, (previous) =>
    previous && previous.revision > value.revision ? previous : value
  )
}

export function useSiteIdentity() {
  return useQuery({
    queryKey: siteIdentityKey,
    queryFn: async ({ signal, client }) => {
      const value = await siteSettingsApi.publicLoad(signal)
      const latest = client.getQueryData<SiteSettings>(siteIdentityKey)
      return latest && latest.revision > value.revision ? latest : value
    },
    retry: false,
    refetchOnWindowFocus: true,
  })
}
