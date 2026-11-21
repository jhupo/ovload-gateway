import { type Row } from '@tanstack/react-table'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { type User } from '../data/schema'
import { UserActions } from './user-actions'
import { UserBalance } from './user-balance'
import { UserIdentity } from './user-identity'
import { UserRoleLabel, UserStatusLabel } from './user-labels'
import { UserTimes } from './user-times'

export function UserMobileRow({ row }: { row: Row<User> }) {
  const { t } = useTranslation()
  const user = row.original
  const visible = new Set(row.getVisibleCells().map((cell) => cell.column.id))
  return (
    <Collapsible asChild>
      <li data-testid='user-row' className='group/user min-w-0 px-3 py-4'>
        <div className='flex min-w-0 items-start justify-between gap-2'>
          <div className='min-w-0 flex-1'>
            <UserIdentity user={user} />
          </div>
          {visible.has('balanceUsd') && (
            <div className='-me-2 -mt-1 shrink-0'>
              <UserBalance user={user} />
            </div>
          )}
        </div>
        <div className='mt-2 flex min-w-0 items-center gap-3 ps-12'>
          {visible.has('role') && <UserRoleLabel role={user.role} />}
          {visible.has('status') && <UserStatusLabel status={user.status} />}
          <div className='ms-auto flex items-center gap-1'>
            <CollapsibleTrigger asChild>
              <Button
                variant='ghost'
                size='sm'
                className='h-9 gap-1 px-1.5 text-[11px] text-muted-foreground shadow-none'
                aria-label={t('users.time_for', { name: user.username })}
              >
                {t('users.time')}
                <ChevronDown
                  className='size-3 transition-transform group-data-[state=open]/user:rotate-180 motion-reduce:transition-none'
                  aria-hidden='true'
                />
              </Button>
            </CollapsibleTrigger>
            <UserActions user={user} />
          </div>
        </div>
        <CollapsibleContent className='ps-12 pt-3'>
          <div className='space-y-2 border-t border-dashed pt-3'>
            <dl className='grid grid-cols-[5.5rem_1fr] gap-3 text-[11px]'>
              <dt className='text-muted-foreground'>ID</dt>
              <dd className='min-w-0 break-all'>{user.id}</dd>
            </dl>
            {visible.has('createdAt') && <UserTimes user={user} />}
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  )
}
