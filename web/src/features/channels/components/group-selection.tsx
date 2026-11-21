import { useId, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { accountProviderLabel } from '@/lib/upstream-platforms'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type Group } from '@/features/groups/data/schema'

export function GroupSelection({
  title,
  groups,
  selected,
  onChange,
}: {
  title: string
  groups: Group[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [query, setQuery] = useState('')
  const filtered = groups.filter((group) =>
    `${group.name} ${group.platform === 'all' ? t('groups.all_platforms') : accountProviderLabel(group.platform)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )
  const checkedCount = filtered.filter((group) =>
    selected.includes(group.id)
  ).length
  const toggleAll = (checked: boolean) =>
    onChange(
      checked
        ? [...new Set([...selected, ...filtered.map((group) => group.id)])]
        : selected.filter(
            (value) => !filtered.some((group) => group.id === value)
          )
    )

  return (
    <div role='group' aria-label={title} className='min-w-0 space-y-3'>
      <div className='flex items-center gap-3'>
        <div className='relative min-w-0 flex-1 sm:max-w-sm'>
          <Search
            aria-hidden
            className='absolute top-2.5 left-3 size-4 text-muted-foreground'
          />
          <Input
            aria-label={t('channelConfig.search', { name: title })}
            placeholder={t('groups.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className='pl-9'
          />
        </div>
        <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
          {t('channelConfig.selected', { count: selected.length })}
        </span>
      </div>
      <div className='overflow-hidden rounded-md border [&>[data-slot=table-container]]:max-h-64 [&>[data-slot=table-container]]:overflow-y-auto'>
        <Table aria-label={title} className='table-fixed'>
          <TableHeader className='sticky top-0 z-10 bg-muted'>
            <TableRow>
              <TableHead className='w-10 text-left'>
                <Checkbox
                  aria-label={t('channelConfig.selectAll')}
                  disabled={!filtered.length}
                  checked={
                    checkedCount > 0 && checkedCount === filtered.length
                      ? true
                      : checkedCount > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
              </TableHead>
              <TableHead>{t('groups.name')}</TableHead>
              <TableHead className='hidden w-32 sm:table-cell'>
                {t('groups.platform')}
              </TableHead>
              <TableHead className='hidden w-20 sm:table-cell'>
                {t('groups.type')}
              </TableHead>
              <TableHead className='w-16 text-left sm:w-20'>
                {t('groups.status')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((group) => (
              <TableRow
                key={group.id}
                data-state={
                  selected.includes(group.id) ? 'selected' : undefined
                }
              >
                <TableCell className='text-left'>
                  <Checkbox
                    id={`${id}-${group.id}`}
                    aria-label={group.name}
                    checked={selected.includes(group.id)}
                    onCheckedChange={(checked) =>
                      onChange(
                        checked === true
                          ? [...new Set([...selected, group.id])]
                          : selected.filter((value) => value !== group.id)
                      )
                    }
                  />
                </TableCell>
                <TableCell className='whitespace-normal'>
                  <label
                    htmlFor={`${id}-${group.id}`}
                    className='block cursor-pointer py-1 font-medium break-words'
                  >
                    {group.name}
                  </label>
                  <span className='block text-xs text-muted-foreground sm:hidden'>
                    {group.platform === 'all'
                      ? t('groups.all_platforms')
                      : accountProviderLabel(group.platform)}{' '}
                    · {t('groups.' + group.visibility)}
                  </span>
                </TableCell>
                <TableCell className='hidden text-muted-foreground sm:table-cell'>
                  {group.platform === 'all'
                    ? t('groups.all_platforms')
                    : accountProviderLabel(group.platform)}
                </TableCell>
                <TableCell className='hidden text-muted-foreground sm:table-cell'>
                  {t('groups.' + group.visibility)}
                </TableCell>
                <TableCell className='text-left'>
                  <Badge variant='outline' className='font-normal'>
                    {t('groups.' + group.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className='hidden h-24 text-center whitespace-normal text-muted-foreground sm:table-cell'
                >
                  {groups.length
                    ? t('common.no_data')
                    : t('channelConfig.noProviderGroups')}
                </TableCell>
                <TableCell
                  colSpan={3}
                  className='h-24 text-center whitespace-normal text-muted-foreground sm:hidden'
                >
                  {groups.length
                    ? t('common.no_data')
                    : t('channelConfig.noProviderGroups')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
