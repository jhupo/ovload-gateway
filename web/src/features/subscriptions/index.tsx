import { useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { type ColumnDef, type CellContext } from '@tanstack/react-table'
import {
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Ban,
  Search,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useClockValue } from '@/hooks/use-clock'
import { useCommerce, planDocument } from '@/hooks/use-commerce'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableSingleFilter,
  DataTableColumnHeader,
} from '@/components/data-table'
import { DataTableFrame } from '@/components/data-table'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { QueryState } from '@/components/query-state'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import {
  type Plan,
  type Subscription,
  newPlan,
  statusOf,
  money,
  day,
} from './data'
import { PlanEditor } from './plan-editor'
import { PlanSubscribers } from './plan-subscribers'
import { Quota } from './quota'
import { SubscriptionEditor } from './subscription-editor'

type EditState =
  | { kind: 'plan'; plan: Plan; creating: boolean }
  | { kind: 'subscription'; subscription?: Subscription }
type Confirmation =
  | { kind: 'reset' | 'revoke'; row: Subscription }
  | { kind: 'delete'; row: Plan }

const route = getRouteApi('/_authenticated/subscriptions/')

export function Subscriptions() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  return (
    <SubscriptionWorkspace
      search={search}
      setSearch={(next) => void navigate({ search: next, replace: true })}
    />
  )
}

type SubscriptionSearch = ReturnType<typeof route.useSearch>
export function SubscriptionPlans() {
  const [search, setSearch] = useState<SubscriptionSearch>({
    query: '',
    status: 'all',
    plan: 'all',
  })
  return (
    <SubscriptionWorkspace plansOnly search={search} setSearch={setSearch} />
  )
}

function PlanStatusCell({ row }: CellContext<Plan, unknown>) {
  const { t } = useTranslation()
  const { execute, busy } = useCommerce()
  return (
    <SwitchLabeled
      size='sm'
      aria-label={t('subscriptions.publish') + ' ' + row.original.name}
      checked={row.original.published}
      disabled={busy}
      onCheckedChange={(published) =>
        void execute({
          action: 'save_plan',
          id: row.original.id,
          revision: row.original.revision,
          document: { ...planDocument(row.original), published },
        }).catch(() => {})
      }
    />
  )
}

function SubscriptionStatus({ row }: { row: Subscription }) {
  const { t } = useTranslation()
  const status = useClockValue((now) => statusOf(row, now))
  return (
    <Badge
      variant='secondary'
      className={
        status === 'active'
          ? 'bg-[var(--telemetry-2)]/10 font-normal text-[var(--telemetry-2)]'
          : 'font-normal'
      }
    >
      {t('subscriptions.' + status)}
    </Badge>
  )
}

function SubscriptionExpiry({ row }: { row: Subscription }) {
  const { t, i18n } = useTranslation()
  const remaining = useClockValue((now) =>
    statusOf(row, now) === 'active'
      ? Math.ceil((Date.parse(row.end) - now) / day)
      : statusOf(row, now)
  )
  return (
    <div className='space-y-1 text-xs tabular-nums'>
      <time dateTime={row.end}>
        {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          timeZone: row.plan.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(row.end))}
      </time>
      <p className='text-muted-foreground'>
        {typeof remaining === 'number'
          ? t('subscriptions.remaining', { count: remaining })
          : t('subscriptions.' + remaining)}
      </p>
    </div>
  )
}

function SubscriptionWorkspace({
  plansOnly = false,
  search,
  setSearch,
}: {
  plansOnly?: boolean
  search: SubscriptionSearch
  setSearch: (next: SubscriptionSearch) => void
}) {
  const { t } = useTranslation()
  const tab = plansOnly ? 'plans' : 'subscriptions'
  const { query, status, plan: planFilter } = search
  const {
    plans,
    records,
    users,
    execute,
    busy,
    ready,
    error,
    refresh,
    tableState,
  } = useCommercePage(plansOnly ? 'plans' : 'subscriptions', {
    search: query,
    status,
    plan: planFilter,
  })
  const setQuery = (query: string) => setSearch({ ...search, query })
  const setStatus = (status: SubscriptionSearch['status']) =>
    setSearch({ ...search, status })
  const setPlanFilter = (plan: string) => setSearch({ ...search, plan })
  const [subscriberPlan, setSubscriberPlan] = useState<Plan | null>(null)
  const [editor, setEditor] = useState<EditState | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const restoreFocus = () => trigger.current?.focus()
  const open = (value: EditState) => {
    trigger.current = document.activeElement as HTMLElement
    setEditor(value)
  }
  const confirm = (value: Confirmation) => {
    trigger.current = document.activeElement as HTMLElement
    setConfirmation(value)
  }
  const userFor = (row: Subscription) =>
    users.find((u) => u.id === row.userId) ?? {
      id: row.userId,
      username: row.userId,
      email: '',
      status: 'inactive',
    }
  const identity = (row: Subscription) => {
    const user = userFor(row)
    return (
      <div className='flex min-w-0 items-center gap-3'>
        <Avatar className='size-9 shrink-0'>
          <AvatarFallback className='bg-muted text-xs'>
            {user.username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium' title={user.username}>
            {user.username}
          </p>
          <p
            className='truncate text-xs text-muted-foreground'
            title={user.email}
          >
            {user.email}
          </p>
        </div>
      </div>
    )
  }
  const actions = (row: Subscription) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('subscriptions.actionsFor', {
            name: userFor(row).username,
          })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        onCloseAutoFocus={(e) => {
          if (editor || confirmation) e.preventDefault()
        }}
      >
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            setEditor({ kind: 'subscription', subscription: row })
          }}
        >
          <Pencil />
          {t('subscriptions.adjust')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => setConfirmation({ kind: 'reset', row })}
        >
          <RotateCcw />
          {t('subscriptions.reset')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant='destructive'
          disabled={busy}
          onSelect={() => setConfirmation({ kind: 'revoke', row })}
        >
          <Ban />
          {t('subscriptions.revoke')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const subscriptionColumns: ColumnDef<Subscription>[] = [
    {
      id: 'user',
      enableHiding: false,
      meta: { label: t('subscriptions.user') },
      accessorFn: (row) => userFor(row).username,
      size: 230,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('subscriptions.user')}
        />
      ),
      cell: ({ row }) => identity(row.original),
    },
    {
      id: 'plan',
      meta: { label: t('subscriptions.plan') },
      accessorFn: (row) => row.plan.name,
      size: 125,
      header: t('subscriptions.plan'),
      cell: ({ row }) => (
        <span
          className='block truncate text-sm font-medium'
          title={row.original.plan.name}
        >
          {row.original.plan.name}
        </span>
      ),
    },
    {
      id: 'usage',
      size: 300,
      header: t('subscriptions.usage'),
      cell: ({ row }) => <Quota row={row.original} />,
    },
    {
      accessorKey: 'end',
      meta: { label: t('subscriptions.expires') },
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('subscriptions.expires')}
        />
      ),
      cell: ({ row }) => <SubscriptionExpiry row={row.original} />,
    },
    {
      id: 'status',
      size: 100,
      header: t('subscriptions.status'),
      cell: ({ row }) => <SubscriptionStatus row={row.original} />,
    },
    {
      id: 'actions',
      size: 65,
      header: () => (
        <div className='text-center'>{t('subscriptions.actions')}</div>
      ),
      cell: ({ row }) => (
        <div
          className='flex justify-center'
          onFocusCapture={(e) => {
            if (
              e.target instanceof HTMLElement &&
              e.target.tagName === 'BUTTON'
            )
              trigger.current = e.target
          }}
        >
          {actions(row.original)}
        </div>
      ),
    },
  ]
  const planActions = (p: Plan) => (
    <div className='flex justify-center gap-1'>
      <Button
        variant='ghost'
        size='icon'
        aria-label={t('subscriptions.editNamed', { name: p.name })}
        disabled={busy}
        onClick={() => open({ kind: 'plan', plan: p, creating: false })}
      >
        <Pencil />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        aria-label={t('subscriptions.deleteNamed', { name: p.name })}
        disabled={busy}
        onClick={() => confirm({ kind: 'delete', row: p })}
      >
        <Trash2 />
      </Button>
    </div>
  )
  const subscriberCount = (id: string) =>
    plans.find((p) => p.id === id)?.subscriberCount ?? 0
  const planColumns: ColumnDef<Plan>[] = [
    {
      accessorKey: 'name',
      enableHiding: false,
      meta: { label: t('subscriptions.planName') },
      size: 170,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('subscriptions.planName')}
        />
      ),
      cell: ({ row }) => (
        <span className='block truncate font-medium' title={row.original.name}>
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'priceCents',
      meta: { label: t('subscriptions.price') },
      size: 100,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('subscriptions.price')}
        />
      ),
      cell: ({ row }) => (
        <div className='tabular-nums'>
          {money(row.original.priceCents)}
          {row.original.originalPriceCents > 0 && (
            <del className='ml-2 text-xs text-muted-foreground'>
              {money(row.original.originalPriceCents)}
            </del>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'days',
      meta: { label: t('subscriptions.duration') },
      size: 90,
      header: t('subscriptions.duration'),
      cell: ({ row }) => row.original.days + ' ' + t('subscriptions.days'),
    },
    {
      id: 'limits',
      size: 150,
      header: t('subscriptions.quota'),
      cell: ({ row }) => (
        <div className='space-y-1 text-xs tabular-nums'>
          {(['daily', 'weekly', 'monthly'] as const).map((period) => (
            <p
              key={period}
              className='grid grid-cols-[2.5rem_max-content] gap-1'
            >
              <span className='text-muted-foreground'>
                {t('subscriptions.' + period)}
              </span>
              {row.original.unlimited[period]
                ? t('subscriptions.unlimited')
                : money(row.original[`${period}Cents`])}
            </p>
          ))}
        </div>
      ),
    },
    {
      id: 'status',
      size: 100,
      header: t('subscriptions.status'),
      cell: PlanStatusCell,
    },
    {
      id: 'subscribers',
      size: 110,
      header: t('subscriptions.subscribers'),
      cell: ({ row }) => (
        <Button
          variant='link'
          className='h-8 px-0 tabular-nums'
          aria-label={t('subscriptions.subscribersFor', {
            name: row.original.name,
          })}
          onClick={(event) => {
            trigger.current = event.currentTarget
            setSubscriberPlan(row.original)
          }}
        >
          {subscriberCount(row.original.id)}
        </Button>
      ),
    },
    { accessorKey: 'sort', size: 65, header: t('subscriptions.sort') },
    {
      id: 'actions',
      size: 95,
      header: () => (
        <div className='text-center'>{t('subscriptions.actions')}</div>
      ),
      cell: ({ row }) => planActions(row.original),
    },
  ]
  const filterPlans = useMemo(
    () => [
      ...new Map(
        [...records.map((r) => r.plan), ...plans].map((p) => [p.id, p])
      ).values(),
    ],
    [records, plans]
  )
  const tableFilters = (
    <div className='contents'>
      <div className='relative w-full sm:w-62.5'>
        <Search
          aria-hidden
          className='absolute top-2 left-3 size-4 text-muted-foreground'
        />
        <Input
          aria-label={t('subscriptions.search')}
          placeholder={t(
            'subscriptions.' + (tab === 'plans' ? 'searchPlans' : 'search')
          )}
          className='h-8 pl-9'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div>
        <DataTableSingleFilter
          title={t('subscriptions.status')}
          value={status}
          onValueChange={(value) =>
            setStatus(value as ReturnType<typeof route.useSearch>['status'])
          }
          options={[
            'all',
            ...(tab === 'plans'
              ? ['published', 'unpublished']
              : ['active', 'scheduled', 'expired', 'revoked']),
          ].map((value) => ({
            value,
            label: t('subscriptions.' + value),
          }))}
        />
      </div>
      {tab === 'subscriptions' && (
        <div>
          <DataTableSingleFilter
            title={t('subscriptions.plan')}
            value={planFilter}
            onValueChange={setPlanFilter}
            options={[
              { value: 'all', label: t('subscriptions.allPlans') },
              ...filterPlans.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      )}
    </div>
  )
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 flex-wrap items-center justify-between gap-3'
        >
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t(
                plansOnly
                  ? 'sidebar.subscription_plans'
                  : 'sidebar.subscriptions'
              )}
            </h1>
          </div>
          <div className='flex gap-2'>
            {plansOnly && (
              <Button
                disabled={busy}
                variant={tab === 'plans' ? 'default' : 'outline'}
                onClick={() =>
                  open({ kind: 'plan', plan: newPlan(), creating: true })
                }
              >
                <Plus />
                {t('subscriptions.createPlan')}
              </Button>
            )}
            {tab === 'subscriptions' && (
              <Button
                disabled={busy}
                onClick={() => open({ kind: 'subscription' })}
              >
                <Plus />
                {t('subscriptions.assign')}
              </Button>
            )}
          </div>
        </div>
        <div className='flex min-h-0 flex-1 flex-col gap-4'>
          {!plansOnly && (
            <div className='relative flex min-h-0 flex-1 flex-col gap-4'>
              <DataTableFrame
                server={tableState}
                toolbar={tableFilters}
                data={records}
                columns={subscriptionColumns}
                label={t('subscriptions.userSubscriptions')}
                mobile={(row) => (
                  <div className='space-y-4'>
                    <div className='flex items-center gap-2'>
                      <div className='min-w-0 flex-1'>{identity(row)}</div>
                      <SubscriptionStatus row={row} />
                      <div
                        onFocusCapture={(e) => {
                          if (
                            e.target instanceof HTMLElement &&
                            e.target.tagName === 'BUTTON'
                          )
                            trigger.current = e.target
                        }}
                      >
                        {actions(row)}
                      </div>
                    </div>
                    <div className='flex items-center justify-between gap-4 border-t pt-3'>
                      <span className='min-w-0 truncate text-sm font-medium'>
                        {row.plan.name}
                      </span>
                      <SubscriptionExpiry row={row} />
                    </div>
                    <Quota row={row} />
                  </div>
                )}
              />
            </div>
          )}
          {plansOnly && (
            <div className='relative flex min-h-0 flex-1 flex-col gap-4'>
              <DataTableFrame
                server={tableState}
                toolbar={tableFilters}
                data={plans}
                columns={planColumns}
                label={t('subscriptions.plans')}
                mobile={(p) => (
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='min-w-0 truncate font-medium'>
                        {p.name}
                      </span>
                      {planActions(p)}
                    </div>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='font-semibold tabular-nums'>
                        {money(p.priceCents)}{' '}
                        <span className='font-normal text-muted-foreground'>
                          / {p.days} {t('subscriptions.days')}
                        </span>
                      </span>
                      <Badge variant='secondary'>
                        {t(
                          'subscriptions.' +
                            (p.published ? 'published' : 'unpublished')
                        )}
                      </Badge>
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {t('subscriptions.subscribers')}{' '}
                      <Button
                        variant='link'
                        className='h-auto px-1 py-0 tabular-nums'
                        aria-label={t('subscriptions.subscribersFor', {
                          name: p.name,
                        })}
                        onClick={(event) => {
                          trigger.current = event.currentTarget
                          setSubscriberPlan(p)
                        }}
                      >
                        {subscriberCount(p.id)}
                      </Button>
                    </p>
                    <div className='grid grid-cols-3 gap-3 border-t pt-3 text-xs'>
                      <div className='space-y-1'>
                        <p className='text-muted-foreground'>
                          {t('subscriptions.dailyLimit')}
                        </p>
                        {p.unlimited.daily
                          ? t('subscriptions.unlimited')
                          : money(p.dailyCents)}
                      </div>
                      <div className='space-y-1'>
                        <p className='text-muted-foreground'>
                          {t('subscriptions.weeklyLimit')}
                        </p>
                        {p.unlimited.weekly
                          ? t('subscriptions.unlimited')
                          : money(p.weeklyCents)}
                      </div>
                      <div className='space-y-1'>
                        <p className='text-muted-foreground'>
                          {t('subscriptions.monthlyLimit')}
                        </p>
                        {p.unlimited.monthly
                          ? t('subscriptions.unlimited')
                          : money(p.monthlyCents)}
                      </div>
                    </div>
                  </div>
                )}
              />
            </div>
          )}
        </div>
      </Main>
      {editor?.kind === 'plan' && (
        <PlanEditor
          key={editor.plan.id}
          initial={editor.plan}
          creating={editor.creating}
          restoreFocus={restoreFocus}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'subscription' && (
        <SubscriptionEditor
          initial={editor.subscription}
          plans={plans}
          restoreFocus={restoreFocus}
          onClose={() => setEditor(null)}
        />
      )}
      {subscriberPlan && (
        <PlanSubscribers
          plan={subscriberPlan}
          onClose={() => setSubscriberPlan(null)}
          restoreFocus={restoreFocus}
        />
      )}
      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(value) => {
          if (!value) {
            setConfirmation(null)
            restoreFocus()
          }
        }}
        title={t('subscriptions.' + (confirmation?.kind ?? 'reset'))}
        desc={
          <span className='sr-only'>
            {t('subscriptions.confirmDescription')}
          </span>
        }
        destructive={confirmation?.kind !== 'reset'}
        confirmText={t('common.confirm')}
        disabled={busy}
        handleConfirm={() => {
          if (!confirmation) return
          const { kind, row } = confirmation
          void execute({
            action:
              kind === 'delete'
                ? 'delete_plan'
                : kind === 'reset'
                  ? 'reset_quota'
                  : 'revoke',
            id: row.id,
            revision: row.revision,
          })
            .then(() => setConfirmation(null))
            .catch(() => {})
        }}
      />
    </>
  )
}
