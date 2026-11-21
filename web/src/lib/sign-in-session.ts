import { redirect } from '@tanstack/react-router'
import { restoreBrowserSession } from '@/stores/identity-session'
import { pendingDatabaseRestore } from '@/features/data-backup/restore-state'
import { managementHomePath } from './route-authority'

export async function redirectSignedIn() {
  if (pendingDatabaseRestore()) return
  const session = await restoreBrowserSession()
  if (session)
    throw redirect({
      to:
        session.audience === 'customer'
          ? '/user/dashboard'
          : managementHomePath(),
      replace: true,
    })
}
