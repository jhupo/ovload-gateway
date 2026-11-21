import { Pencil, Power, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AccountGroup } from '@/api/account-groups'
import { Button } from '@/components/ui/button'

export type GroupActionsOptions = {
  writable: boolean
  pending: boolean
  onEdit: (group: AccountGroup, button: HTMLButtonElement) => void
  onOverrides: (group: AccountGroup, button: HTMLButtonElement) => void
  onToggle: (group: AccountGroup) => void
  onDelete: (group: AccountGroup, button: HTMLButtonElement) => void
}

export function GroupActions({
  group,
  writable,
  pending,
  onEdit,
  onOverrides,
  onToggle,
  onDelete,
}: GroupActionsOptions & { group: AccountGroup }) {
  const { t } = useTranslation()
  return (
    <div className='flex justify-end gap-1'>
      <Button
        variant='ghost'
        size='icon-sm'
        disabled={pending || !writable}
        aria-label={t('groups.edit_for', { name: group.name })}
        title={t('groups.edit')}
        onClick={(event) => onEdit(group, event.currentTarget)}
      >
        <Pencil className='size-4' aria-hidden='true' />
      </Button>
      <Button
        variant='ghost'
        size='icon-sm'
        disabled={pending}
        aria-label={t('groups.exclusive_for', { name: group.name })}
        title={t('groups.exclusive')}
        onClick={(event) => onOverrides(group, event.currentTarget)}
      >
        <SlidersHorizontal className='size-4' aria-hidden='true' />
      </Button>
      <Button
        variant='ghost'
        size='icon-sm'
        disabled={pending || !writable}
        aria-label={`${t(group.enabled ? 'channelGroups.disable' : 'channelGroups.enable')} ${group.name}`}
        title={t(
          group.enabled ? 'channelGroups.disable' : 'channelGroups.enable'
        )}
        onClick={() => onToggle(group)}
      >
        <Power className='size-4' aria-hidden='true' />
      </Button>
      <Button
        variant='ghost'
        size='icon-sm'
        disabled={pending || !writable}
        aria-label={t('groups.delete_for', { name: group.name })}
        title={t('groups.delete')}
        onClick={(event) => onDelete(group, event.currentTarget)}
      >
        <Trash2 className='size-4' aria-hidden='true' />
      </Button>
    </div>
  )
}
