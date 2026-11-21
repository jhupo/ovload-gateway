import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, Check, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  accountGroupFields,
  type AccountGroup,
  type GroupFields,
} from '@/api/account-groups'
import { customersApi, type CustomerSummary } from '@/api/customers'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { RequestErrorToast } from '@/components/request-error-toast'
import { retailMultiplierText } from '../data/retail-multiplier'

type Draft = { owner: string; label?: string; rate: string; rpm: string }
function UserLabel({ owner, label }: Pick<Draft, 'owner' | 'label'>) {
  const session = useIdentitySession((s) => s.session?.id)
  const [tenant_id, id] = owner.split('/')
  const user = useQuery({
    queryKey: ['group-override-user', session, tenant_id, id],
    queryFn: ({ signal }) => customersApi.get({ tenant_id, id }, signal),
    enabled: !label && allows('identity.users.read'),
    retry: false,
  })
  return (
    <span className='min-w-0 text-sm font-medium break-all'>
      {label ?? user.data?.data.email ?? id}
    </span>
  )
}
export function GroupOverrides({
  group,
  pending,
  writable,
  onClose,
  restoreFocus,
  onSave,
}: {
  group: AccountGroup
  pending: boolean
  writable: boolean
  onClose: () => void
  restoreFocus: () => void
  onSave: (fields: GroupFields) => void
}) {
  const { t } = useTranslation()
  const session = useIdentitySession((s) => s.session?.id)
  const [rows, setRows] = useState<Draft[]>(() =>
    Object.entries(group.controls.userOverrides).map(([owner, v]) => ({
      owner,
      rate:
        v.multiplierBps === null ? '' : retailMultiplierText(v.multiplierBps),
      rpm: v.requestsPerMinute === null ? '' : String(v.requestsPerMinute),
    }))
  )
  const [initial] = useState(JSON.stringify(rows))
  const dirty = initial !== JSON.stringify(rows)
  const [discard, setDiscard] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [invalid, setInvalid] = useState<string | null>(null)
  const users = useQuery({
    queryKey: ['group-override-options', session, search, page],
    queryFn: ({ signal }) =>
      customersApi.list({ page, page_size: 20, query: search }, signal),
    enabled: open && allows('identity.users.read'),
    retry: false,
  })
  const close = () => {
    if (pending) return
    if (dirty) setDiscard(true)
    else onClose()
  }
  const add = (user: CustomerSummary) => {
    const owner = `${user.tenant_id}/${user.id}`
    if (!rows.some((r) => r.owner === owner))
      setRows([...rows, { owner, label: user.email, rate: '', rpm: '' }])
    setOpen(false)
  }
  const save = () => {
    const overrides: AccountGroup['controls']['userOverrides'] = {}
    for (const row of rows) {
      const rate = row.rate.trim(),
        rpm = row.rpm.trim()
      if (
        (!rate && !rpm) ||
        (rate && (!/^\d{1,3}(\.\d{1,4})?$/.test(rate) || Number(rate) > 100)) ||
        (rpm && (!/^\d{1,7}$/.test(rpm) || Number(rpm) > 1000000))
      ) {
        setInvalid(row.owner)
        toast.error(t('channelGroups.invalid'))
        return
      }
      const multiplier = rate ? Math.round(Number(rate) * 10000) : null
      const peak = group.pricing.peak
      if (
        multiplier !== null &&
        peak &&
        [peak.peakMultiplierBps, peak.offPeakMultiplierBps].some(
          (v) => v * multiplier > 10000000000
        )
      ) {
        setInvalid(row.owner)
        toast.error(t('channelGroups.invalid'))
        return
      }
      overrides[row.owner] = {
        multiplierBps: multiplier,
        requestsPerMinute: rpm ? Number(rpm) : null,
      }
    }
    onSave({
      ...accountGroupFields(group),
      controls: { ...group.controls, userOverrides: overrides },
    })
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(value) => {
          if (!value) close()
        }}
      >
        <DialogContent
          className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl'
          onEscapeKeyDown={(e) => {
            if (pending || dirty) {
              e.preventDefault()
              close()
            }
          }}
          onInteractOutside={(e) => {
            if (pending || dirty) {
              e.preventDefault()
              close()
            }
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('groups.exclusive')}</DialogTitle>
            <DialogDescription>{group.name}</DialogDescription>
          </DialogHeader>
          {users.error && <RequestErrorToast message={users.error.message} />}
          <Popover modal open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                role='combobox'
                aria-expanded={open}
                disabled={
                  pending ||
                  !writable ||
                  !allows('identity.users.read') ||
                  rows.length >= 256
                }
                className='w-full justify-between'
              >
                <span>{t('groups.user_select')}</span>
                <ChevronsUpDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align='start'
              className='w-[var(--radix-popover-trigger-width)] p-0'
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('groups.user_search')}
                  value={search}
                  onValueChange={(value) => {
                    setSearch(value)
                    setPage(1)
                  }}
                />
                <CommandList>
                  <CommandEmpty>
                    {users.isFetching
                      ? t('common.loading')
                      : t('data_table.no_results')}
                  </CommandEmpty>
                  {users.data?.items.map((user) => {
                    const selected = rows.some(
                      (r) => r.owner === `${user.tenant_id}/${user.id}`
                    )
                    return (
                      <CommandItem
                        key={`${user.tenant_id}/${user.id}`}
                        disabled={selected}
                        onSelect={() => add(user)}
                      >
                        <span className='min-w-0 break-all'>{user.email}</span>
                        {selected && <Check className='ms-auto' />}
                      </CommandItem>
                    )
                  })}
                </CommandList>
              </Command>
              <div className='flex justify-between gap-2 border-t p-2'>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={page === 1 || users.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  {t('groups.previous_users')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={
                    !users.data ||
                    page * 20 >= users.data.total ||
                    users.isFetching
                  }
                  onClick={() => setPage(page + 1)}
                >
                  {t('groups.next_users')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <div className='min-h-0 space-y-4 overflow-y-auto overscroll-contain'>
            {!rows.length && (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                {t('groups.no_overrides')}
              </p>
            )}
            {rows.map((row, index) => (
              <fieldset
                key={row.owner}
                disabled={pending || !writable}
                className='space-y-3 border-b pb-4'
                data-testid='group-override'
              >
                <div className='flex items-center justify-between gap-2'>
                  <UserLabel owner={row.owner} label={row.label} />
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('groups.remove_override', {
                      name: row.label ?? row.owner,
                    })}
                    onClick={() =>
                      setRows(rows.filter((r) => r.owner !== row.owner))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  {(['rate', 'rpm'] as const).map((key) => (
                    <div key={key} className='space-y-2'>
                      <Label htmlFor={`override-${index}-${key}`}>
                        {t(key === 'rate' ? 'groups.multiplier' : 'groups.rpm')}
                      </Label>
                      <Input
                        id={`override-${index}-${key}`}
                        inputMode={key === 'rate' ? 'decimal' : 'numeric'}
                        value={row[key]}
                        aria-invalid={invalid === row.owner}
                        placeholder={t('groups.inherit_value', {
                          value:
                            key === 'rate'
                              ? retailMultiplierText(group.retailMultiplierBps)
                              : group.controls.requestsPerMinute,
                        })}
                        onChange={(e) => {
                          setInvalid(null)
                          setRows(
                            rows.map((r) =>
                              r.owner === row.owner
                                ? { ...r, [key]: e.target.value }
                                : r
                            )
                          )
                        }}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <DialogFooter>
            <Button variant='outline' disabled={pending} onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button disabled={pending || !writable || !dirty} onClick={save}>
              {t('groups.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t('channelGroups.discard')}
        desc={t('channelGroups.discardWarning')}
        confirmText={t('channelGroups.discard')}
        handleConfirm={onClose}
      />
    </>
  )
}
