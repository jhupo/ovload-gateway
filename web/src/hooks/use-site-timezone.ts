import { useSiteIdentity } from './use-site-identity'

export function useSiteTimezone() {
  // Matches the deployment default; replaced by server metadata when configured.
  return useSiteIdentity().data?.timezone ?? 'Asia/Shanghai'
}
