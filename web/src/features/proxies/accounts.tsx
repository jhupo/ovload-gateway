import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link2Off, Plus, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { proxies, type ProxyRecord, type ProxyAccount } from '@/api/proxies'
import {
  settingsFor,
  upstreamAccounts,
  type UpstreamAccount,
} from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { accountProviderLabel } from '@/lib/upstream-platforms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { RequestErrorToast } from '@/components/request-error-toast'
import { ProxyDialog, ProxyPagination, ProxySearch } from './components'

type Account = ProxyAccount | UpstreamAccount
function Identity({ account }: { account: Account }) {
  return (
    <div className='flex items-center gap-3 py-2'>
      <div className='grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'>
        <UserRound aria-hidden className='size-5' />
      </div>
      <div className='min-w-0 space-y-1'>
        <div className='font-medium break-words'>{account.name}</div>
        {account.email && (
          <div className='text-xs break-all text-muted-foreground'>
            {account.email}
          </div>
        )}
      </div>
    </div>
  )
}
function Groups({ account }: { account: Account }) {
  return (
    <div className='flex max-w-64 flex-wrap gap-1'>
      {account.groups.length ? (
        account.groups.map((g) => (
          <Badge key={g.id} variant='outline'>
            {g.name}
          </Badge>
        ))
      ) : (
        <span className='text-muted-foreground'>—</span>
      )}
    </div>
  )
}
function Subscription({ account }: { account: Account }) {
  return account.planTypeDisplay || account.planType ? (
    <Badge variant='secondary'>
      {account.planTypeDisplay ?? account.planType}
    </Badge>
  ) : (
    <span className='text-muted-foreground'>—</span>
  )
}

export function ProxyAccounts({
  record,
  owner,
  canManage,
  onClose,
  onChanged,
  restoreFocus,
}: {
  record: ProxyRecord
  owner: string
  canManage: boolean
  onClose: () => void
  onChanged: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(20),
    [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState(false),
    [removing, setRemoving] = useState<ProxyAccount | null>(null)
  const query = useQuery({
    queryKey: ['proxy-accounts', owner, record.id, page, pageSize, search],
    queryFn: ({ signal }) =>
      proxies.accounts(record.id, page, signal, search, pageSize),
    retry: false,
    gcTime: 0,
  })
  const mutation = useMutation({
    mutationFn: async (id: string) => {
      if (useIdentitySession.getState().session?.id !== owner)
        throw new Error(t('liveInfrastructure.sessionChanged'))
      return proxies.removeAccount(record.id, id)
    },
    onSuccess: () => {
      if (useIdentitySession.getState().session?.id !== owner) return
      setRemoving(null)
      if (page > 1 && query.data?.items.length === 1) setPage(page - 1)
      onChanged()
      void query.refetch()
      toast.success(t('liveInfrastructure.saved'))
    },
    onError: (error) => {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(error.message)
    },
  })
  return (
    <>
      <ProxyDialog
        title={t('proxies.accounts')}
        description={record.name}
        wide
        busy={mutation.isPending}
        onClose={onClose}
        restoreFocus={restoreFocus}
      >
        <DataTableToolbarLayout
          actions={
            <Button
              disabled={!canManage || mutation.isPending}
              onClick={() => setAssigning(true)}
            >
              <Plus />
              {t('proxyDesign.assignAccounts')}
            </Button>
          }
        >
          <ProxySearch
            label={t('proxyDesign.searchAccounts')}
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
          />
        </DataTableToolbarLayout>
        {query.error && <RequestErrorToast message={query.error.message} />}
        <div className='min-h-48 min-w-0 overflow-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  'account',
                  'provider',
                  'subscription',
                  'groups',
                  'actions',
                ].map((key) => (
                  <TableHead key={key}>{t('proxyDesign.' + key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className='min-w-56 whitespace-normal'>
                    <Identity account={account} />
                  </TableCell>
                  <TableCell>
                    {accountProviderLabel(account.provider)}
                  </TableCell>
                  <TableCell>
                    <Subscription account={account} />
                  </TableCell>
                  <TableCell>
                    <Groups account={account} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon'
                      disabled={!canManage || mutation.isPending}
                      aria-label={t('proxyDesign.detachAccount', {
                        name: account.name,
                      })}
                      title={t('liveInfrastructure.detach')}
                      onClick={() => setRemoving(account)}
                    >
                      <Link2Off />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!query.data?.items.length && (
            <p className='p-8 text-center text-sm text-muted-foreground'>
              {t(
                query.isPending
                  ? 'liveInfrastructure.loading'
                  : 'proxies.noAccounts'
              )}
            </p>
          )}
        </div>
        <ProxyPagination
          page={page}
          pageSize={pageSize}
          total={query.data?.page.total ?? 0}
          busy={query.isFetching || mutation.isPending}
          onPage={setPage}
          onSize={(v) => {
            setSize(v)
            setPage(1)
          }}
        />
        {assigning && (
          <AssignAccounts
            record={record}
            owner={owner}
            onClose={() => setAssigning(false)}
            onChanged={() => {
              onChanged()
              void query.refetch()
            }}
          />
        )}
      </ProxyDialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setRemoving(null)
        }}
        title={t('liveInfrastructure.detachConfirm')}
        desc={removing?.name ?? ''}
        confirmText={t('liveInfrastructure.detach')}
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (removing) mutation.mutate(removing.id)
        }}
      />
    </>
  )
}

function AssignAccounts({
  record,
  owner,
  onClose,
  onChanged,
}: {
  record: ProxyRecord
  owner: string
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(20),
    [search, setSearch] = useState('')
  // Keep selections across search/page changes; identities shown when assigning are checked again before writing.
  const [selected, setSelected] = useState<Map<string, string | null>>(
    () => new Map()
  )
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search,
  })
  const query = useQuery({
    queryKey: ['proxy-assign-accounts', owner, params.toString()],
    queryFn: ({ signal }) => upstreamAccounts.list(params, signal),
    retry: false,
    gcTime: 0,
  })
  const mutation = useMutation({
    mutationFn: async () => {
      for (const [id, previousProxy] of selected) {
        if (useIdentitySession.getState().session?.id !== owner)
          throw new Error(t('liveInfrastructure.sessionChanged'))
        // Each update advances the global configuration revision. Fetch just before each write,
        // and refuse to overwrite an account another operator has moved since selection.
        const { account } = await upstreamAccounts.detail(id)
        if (account.outboundProxyId !== record.id) {
          if (account.outboundProxyId !== previousProxy)
            throw new Error(t('proxyDesign.bindingChanged'))
          await upstreamAccounts.update(
            account,
            settingsFor(account),
            record.id
          )
        }
        setSelected((old) => {
          const next = new Map(old)
          next.delete(id)
          return next
        })
      }
    },
    onSuccess: () => {
      if (useIdentitySession.getState().session?.id !== owner) return
      onChanged()
      toast.success(t('liveInfrastructure.saved'))
      onClose()
    },
    onError: (error) => {
      if (useIdentitySession.getState().session?.id !== owner) return
      onChanged()
      void query.refetch()
      toast.error(error.message)
    },
  })
  const items = query.data?.items ?? [],
    available = items.filter((a) => a.outboundProxyId !== record.id)
  const chosen = available.filter((a) => selected.has(a.id)).length
  function toggle(account: UpstreamAccount, checked: boolean) {
    setSelected((old) => {
      const next = new Map(old)
      if (checked) next.set(account.id, account.outboundProxyId)
      else next.delete(account.id)
      return next
    })
  }
  return (
    <ProxyDialog
      title={t('proxyDesign.assignAccounts')}
      description={record.name}
      wide
      busy={mutation.isPending}
      onClose={onClose}
    >
      <DataTableToolbarLayout
        actions={
          <Button
            disabled={!selected.size || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('proxyDesign.assignSelected', { count: selected.size })}
          </Button>
        }
      >
        <ProxySearch
          label={t('proxyDesign.searchAccounts')}
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
        />
      </DataTableToolbarLayout>
      {query.error && <RequestErrorToast message={query.error.message} />}
      <div className='min-h-48 min-w-0 overflow-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <Checkbox
                  aria-label={t('proxies.selectPage')}
                  disabled={mutation.isPending || !available.length}
                  checked={
                    !!available.length &&
                    (chosen === available.length
                      ? true
                      : chosen
                        ? 'indeterminate'
                        : false)
                  }
                  onCheckedChange={(v) =>
                    setSelected((old) => {
                      const next = new Map(old)
                      for (const a of available) {
                        if (v) next.set(a.id, a.outboundProxyId)
                        else next.delete(a.id)
                      }
                      return next
                    })
                  }
                />
              </TableHead>
              {[
                'account',
                'provider',
                'subscription',
                'groups',
                'currentProxy',
              ].map((key) => (
                <TableHead key={key}>{t('proxyDesign.' + key)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((account) => (
              <TableRow
                key={account.id}
                data-state={selected.has(account.id) ? 'selected' : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={t('proxies.selectRow', { name: account.name })}
                    checked={selected.has(account.id)}
                    disabled={
                      mutation.isPending ||
                      account.outboundProxyId === record.id
                    }
                    onCheckedChange={(v) => toggle(account, !!v)}
                  />
                </TableCell>
                <TableCell className='min-w-56 whitespace-normal'>
                  <Identity account={account} />
                </TableCell>
                <TableCell>{accountProviderLabel(account.provider)}</TableCell>
                <TableCell>
                  <Subscription account={account} />
                </TableCell>
                <TableCell>
                  <Groups account={account} />
                </TableCell>
                <TableCell>
                  {account.outboundProxyId === record.id ? (
                    <span className='text-emerald-700 dark:text-emerald-400'>
                      {t('proxyDesign.alreadyAssigned')}
                    </span>
                  ) : (
                    <span className='block max-w-56 text-xs break-all whitespace-normal text-muted-foreground'>
                      {account.outboundProxyEndpoint ?? t('proxyDesign.direct')}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!items.length && (
          <p className='p-8 text-center text-sm text-muted-foreground'>
            {t(
              query.isPending
                ? 'liveInfrastructure.loading'
                : 'proxies.noAccounts'
            )}
          </p>
        )}
      </div>
      <ProxyPagination
        page={page}
        pageSize={pageSize}
        total={query.data?.page.total ?? 0}
        busy={query.isFetching || mutation.isPending}
        onPage={setPage}
        onSize={(v) => {
          setSize(v)
          setPage(1)
        }}
      />
      <div className='flex shrink-0 flex-wrap items-center justify-between gap-4'>
        <span className='text-sm text-muted-foreground'>
          {t('proxies.selected', { count: selected.size })}
        </span>
        <div className='flex gap-2'>
          <Button
            variant='ghost'
            disabled={mutation.isPending}
            onClick={onClose}
          >
            {t('proxies.cancel')}
          </Button>
        </div>
      </div>
    </ProxyDialog>
  )
}
