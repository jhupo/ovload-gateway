import type { WorkspaceVisibility } from '@/api/workspace-settings'

export function workspacePathEnabled(
  path: string,
  flags: WorkspaceVisibility | undefined
) {
  if (path === '/channel-status' || path === '/user/channel-status')
    return flags?.channelStatus === true
  if (path === '/lottery' || path === '/user/lottery')
    return flags?.lottery === true
  if (path === '/security-audit') return flags?.securityAudit === true
  if (path.startsWith('/referrals/') || path === '/user/referrals')
    return flags?.referral === true
  return true
}
