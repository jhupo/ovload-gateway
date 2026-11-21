import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { DataTableColumnHeader } from '@/components/data-table'
import { type User } from '../data/schema'
import { UserActions } from './user-actions'
import { UserBalance } from './user-balance'
import { UserIdentity } from './user-identity'
import { UserRoleLabel, UserStatusLabel } from './user-labels'
import { UserTimes } from './user-times'

export function useUsersColumns(canSortBalance: boolean): ColumnDef<User>[] {
  const { t } = useTranslation()
  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='ID' />
      ),
      cell: ({ row }) => (
        <span
          className='block w-28 truncate pl-3 text-xs text-muted-foreground tabular-nums'
          title={row.original.id}
        >
          {row.original.id}
        </span>
      ),
      enableHiding: false,
      meta: { label: 'ID', className: 'w-32 min-w-32' },
    },
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('users.user')} />
      ),
      cell: ({ row }) => (
        <div className='max-w-72 min-w-56 pl-3 xl:w-64'>
          <UserIdentity user={row.original} />
        </div>
      ),
      enableHiding: false,
      meta: { label: t('users.user'), className: 'min-w-60' },
    },
    {
      accessorKey: 'role',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('users.role')} />
      ),
      cell: ({ row }) => <UserRoleLabel role={row.original.role} />,
      enableSorting: false,
      meta: { label: t('users.role'), className: 'min-w-24' },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('users.status')} />
      ),
      cell: ({ row }) => <UserStatusLabel status={row.original.status} />,
      enableSorting: false,
      meta: { label: t('users.status'), className: 'min-w-24' },
    },
    {
      accessorKey: 'balanceUsd',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('users.balance')} />
      ),
      cell: ({ row }) => <UserBalance user={row.original} />,
      enableSorting: canSortBalance,
      meta: { label: t('users.balance'), className: 'min-w-28' },
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('users.time')} />
      ),
      cell: ({ row }) => (
        <div className='py-3 pl-3'>
          <UserTimes user={row.original} />
        </div>
      ),
      meta: { label: t('users.time'), className: 'min-w-64' },
    },
    {
      id: 'actions',
      header: () => (
        <span className='block pr-2 text-left'>{t('users.actions')}</span>
      ),
      cell: ({ row }) => <UserActions user={row.original} />,
      enableHiding: false,
      meta: { label: t('users.actions'), className: 'w-16 min-w-16' },
    },
  ]
}
