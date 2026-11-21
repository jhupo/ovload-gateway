import { useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  BarChart3,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEngagement } from '@/hooks/use-engagement'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableSingleFilter,
  DataTableColumnHeader,
  DataTablePagination,
} from '@/components/data-table'
import { MetricList } from '@/components/data-table/metric-list'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { AnnouncementContent } from './content'
import { type Announcement, announcementStatus } from './data'
import { AnnouncementEditor } from './editor'
import { useAnnouncementGroups } from './use-groups'

const emptyAnnouncements: Announcement[] = []
const route = getRouteApi('/_authenticated/announcements/')
export function Announcements() {
  const { t, i18n } = useTranslation()
  const search = route.useSearch(),
    navigate = route.useNavigate()
  const now = Math.floor(Date.now() / 15000) * 15000
  const {
    data: records = emptyAnnouncements,
    execute,
    busy,
    refresh,
  } = useEngagement<Announcement[]>('announcements')
  const groups = useAnnouncementGroups()
  const data = useMemo(
    () =>
      records.filter(
        (item) =>
          (!search.query ||
            `${item.title} ${item.content}`
              .toLowerCase()
              .includes(search.query.toLowerCase())) &&
          (!search.status ||
            search.status === 'all' ||
            announcementStatus(item, now) === search.status) &&
          (!search.delivery ||
            search.delivery === 'all' ||
            item.delivery === search.delivery)
      ),
    [records, search.query, search.status, search.delivery, now]
  )
  const [editor, setEditor] = useState<{ item?: Announcement } | null>(null)
  const [panel, setPanel] = useState<{
    item: Announcement
    mode: 'preview' | 'statistics'
  } | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const trigger = useRef<HTMLElement | null>(null),
    create = useRef<HTMLButtonElement>(null)
  const restoreFocus = () =>
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : create.current)?.focus()
    )
  const open = (
    event: React.MouseEvent<HTMLElement>,
    item: Announcement,
    mode: 'edit' | 'preview' | 'statistics'
  ) => {
    trigger.current = event.currentTarget
    if (mode === 'edit') setEditor({ item })
    else setPanel({ item, mode })
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value))
  const status = (item: Announcement) => {
    const value = announcementStatus(item, now)
    return (
      <Badge
        variant='secondary'
        className={`gap-1.5 font-normal transition-none ${value === 'published' ? 'bg-badge-success text-badge-success-foreground' : value === 'scheduled' ? 'bg-badge-warning text-badge-warning-foreground' : 'bg-badge-neutral text-badge-neutral-foreground'}`}
      >
        <span aria-hidden='true' className='size-1.5 rounded-full bg-current' />
        {t(`announcements.${value}`)}
      </Badge>
    )
  }
  const audience = (item: Announcement) =>
    item.groupIds.length ? (
      <span
        title={item.groupIds
          .map((id) => groups.find((g) => g.id === id)?.name)
          .join(', ')}
      >
        {t('announcements.groupCount', { count: item.groupIds.length })}
      </span>
    ) : (
      t('announcements.allUsers')
    )
  const times = (item: Announcement) => (
    <MetricList className='gap-x-3'>
      {[
        [
          'start',
          item.startsAt ? date(item.startsAt) : t('announcements.immediate'),
        ],
        ['end', item.endsAt ? date(item.endsAt) : t('announcements.permanent')],
        ['created', date(item.createdAt)],
      ].map(([key, value]) => (
        <div key={key} className='contents'>
          <dt className='text-muted-foreground'>{t(`announcements.${key}`)}</dt>
          <dd className='min-w-0'>{value}</dd>
        </div>
      ))}
    </MetricList>
  )
  const menu = (item: Announcement) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={t('announcements.forItem', {
            action: t('announcements.more'),
            title: item.title,
          })}
          onClick={(e) => {
            trigger.current = e.currentTarget
          }}
        >
          <MoreHorizontal aria-hidden='true' className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        onCloseAutoFocus={(e) => {
          if (editor || panel || deleting) e.preventDefault()
        }}
      >
        {[
          { key: 'preview', icon: Eye },
          { key: 'statistics', icon: BarChart3 },
          { key: 'edit', icon: Pencil },
        ].map((action) => (
          <DropdownMenuItem
            key={action.key}
            onSelect={() =>
              action.key === 'edit'
                ? setEditor({ item })
                : setPanel({
                    item,
                    mode: action.key as 'preview' | 'statistics',
                  })
            }
          >
            <action.icon aria-hidden='true' />
            {t(`announcements.${action.key}`)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant='destructive'
          onSelect={() => setDeleting(item)}
        >
          <Trash2 aria-hidden='true' />
          {t('announcements.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const columns: ColumnDef<Announcement>[] = [
    {
      accessorKey: 'title',
      size: 260,
      enableHiding: false,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('announcements.subject')}
        />
      ),
      cell: ({ row }) => (
        <div className='min-w-0'>
          <div
            className='line-clamp-2 font-medium break-words'
            title={row.original.title}
          >
            {row.original.title}
          </div>
          <div className='mt-1 text-xs text-muted-foreground'>
            #{row.original.id.slice(0, 8)}
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      accessorFn: (a) => announcementStatus(a, now),
      size: 110,
      meta: { label: t('announcements.status') },
      header: t('announcements.status'),
      cell: ({ row }) => status(row.original),
    },
    {
      accessorKey: 'delivery',
      size: 110,
      meta: { label: t('announcements.delivery') },
      header: t('announcements.delivery'),
      cell: ({ row }) => (
        <Badge variant='secondary' className='font-normal transition-none'>
          {t(`announcements.${row.original.delivery}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'groupIds',
      size: 120,
      meta: { label: t('announcements.audience') },
      header: t('announcements.audience'),
      cell: ({ row }) => audience(row.original),
    },
    {
      accessorKey: 'createdAt',
      size: 238,
      meta: { label: t('announcements.time') },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('announcements.time')}
        />
      ),
      cell: ({ row }) => times(row.original),
    },
    {
      id: 'actions',
      size: 190,
      enableHiding: false,
      header: t('announcements.actions'),
      cell: ({ row }) => (
        <div className='flex items-center'>
          {[
            { mode: 'preview', icon: Eye },
            { mode: 'statistics', icon: BarChart3 },
            { mode: 'edit', icon: Pencil },
          ].map((action) => (
            <Button
              key={action.mode}
              variant='ghost'
              size='icon'
              className='size-8'
              aria-label={t('announcements.forItem', {
                action: t(`announcements.${action.mode}`),
                title: row.original.title,
              })}
              onClick={(e) =>
                open(
                  e,
                  row.original,
                  action.mode as 'preview' | 'statistics' | 'edit'
                )
              }
            >
              <action.icon aria-hidden='true' className='size-4' />
            </Button>
          ))}
          {menu(row.original)}
        </div>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (a) => a.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const filter = (key: 'status' | 'delivery', values: string[]) => (
    <DataTableSingleFilter
      title={t(`announcements.${key}`)}
      value={search[key]}
      onValueChange={(value) => {
        void navigate({
          search: (previous) => ({ ...previous, [key]: value }),
          replace: true,
        })
        table.setPageIndex(0)
      }}
      options={values
        .filter((value) => value !== 'all')
        .map((value) => ({ value, label: t(`announcements.${value}`) }))}
    />
  )
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 items-center justify-between gap-3'
        >
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('announcements.title')}
            </h1>
          </div>
          <Button
            ref={create}
            onClick={(e) => {
              trigger.current = e.currentTarget
              setEditor({})
            }}
          >
            <Plus aria-hidden='true' />
            {t('announcements.create')}
          </Button>
        </div>
        <div className='flex min-h-0 flex-1 flex-col gap-4'>
          <DataTableToolbarLayout
            actions={
              <>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-8'
                  aria-label={t('announcements.refresh')}
                  onClick={() => void refresh()}
                >
                  <RefreshCw aria-hidden='true' className='size-4' />
                </Button>
                <DataTableViewOptions table={table} />
              </>
            }
          >
            <Input
              className='h-8 w-full sm:w-64'
              placeholder={t('announcements.search')}
              aria-label={t('announcements.search')}
              maxLength={200}
              value={search.query}
              onChange={(e) => {
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    query: e.target.value,
                  }),
                  replace: true,
                })
                table.setPageIndex(0)
              }}
            />
            <div className='flex flex-wrap gap-2'>
              {filter('status', [
                'all',
                'draft',
                'published',
                'scheduled',
                'archived',
              ])}
              {filter('delivery', ['all', 'silent', 'popup'])}
            </div>
          </DataTableToolbarLayout>
          <div
            className='min-h-0 flex-1 overflow-hidden rounded-md border'
            data-testid='announcements-list'
          >
            <div className='hidden h-full overflow-auto xl:block [&>[data-slot=table-container]]:overflow-visible'>
              <Table
                className='table-fixed'
                aria-label={t('announcements.title')}
              >
                <TableHeader className='sticky top-0 z-10 bg-background'>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id} className='transition-none'>
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className='bg-background px-4'
                          style={{
                            width: `${(header.getSize() / table.getTotalSize()) * 100}%`,
                          }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className='transition-none'>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className='px-4 py-4 whitespace-normal'
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!data.length && (
                    <TableRow className='transition-none'>
                      <TableCell
                        colSpan={columns.length}
                        className='h-40 text-center text-muted-foreground'
                      >
                        {t('common.no_data')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className='h-full divide-y overflow-auto xl:hidden'>
              {table.getRowModel().rows.map(({ original: item }) => (
                <article key={item.id} className='space-y-3 p-4'>
                  <div className='flex items-start justify-between gap-2'>
                    <h2 className='min-w-0 text-sm font-semibold break-words'>
                      {item.title}
                    </h2>
                    {menu(item)}
                  </div>
                  <div className='flex flex-wrap items-center gap-2 text-xs'>
                    <span className='text-muted-foreground'>
                      #{item.id.slice(0, 8)}
                    </span>
                    {table.getColumn('status')?.getIsVisible() && status(item)}
                    {table.getColumn('delivery')?.getIsVisible() && (
                      <Badge
                        variant='secondary'
                        className='font-normal transition-none'
                      >
                        {t(`announcements.${item.delivery}`)}
                      </Badge>
                    )}
                  </div>
                  {table.getColumn('groupIds')?.getIsVisible() && (
                    <div className='text-xs text-muted-foreground'>
                      {audience(item)}
                    </div>
                  )}
                  {table.getColumn('createdAt')?.getIsVisible() && times(item)}
                </article>
              ))}
              {!data.length && (
                <div className='grid h-40 place-items-center text-sm text-muted-foreground'>
                  {t('common.no_data')}
                </div>
              )}
            </div>
          </div>
          <DataTablePagination table={table} />
        </div>
      </Main>
      {editor && (
        <AnnouncementEditor
          item={editor.item}
          groups={groups}
          busy={busy}
          onSave={async (document) => {
            await execute({
              op: 'save_announcement',
              id: editor.item?.id ?? null,
              revision: editor.item?.revision ?? null,
              document,
            })
            setEditor(null)
          }}
          onClose={() => setEditor(null)}
          restoreFocus={restoreFocus}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value) {
            setDeleting(null)
            restoreFocus()
          }
        }}
        title={t('announcements.deleteTitle')}
        desc={<span className='sr-only'>{t('announcements.title')}</span>}
        destructive
        confirmText={t('announcements.deleteAction')}
        disabled={busy}
        handleConfirm={() => {
          if (deleting)
            void execute({
              op: 'delete_announcement',
              id: deleting.id,
              revision: deleting.revision,
            })
              .then(() => setDeleting(null))
              .catch(() => {})
        }}
      >
        <p className='truncate text-sm'>{deleting?.title}</p>
      </ConfirmDialog>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl'
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 text-left'>
            <DialogTitle className='pr-8'>
              {t(`announcements.${panel?.mode ?? 'preview'}`)}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {t('announcements.title')}
            </DialogDescription>
          </DialogHeader>
          <Button
            variant='ghost'
            size='icon'
            className='absolute top-3 right-3'
            aria-label={t('announcements.close')}
            onClick={() => setPanel(null)}
          >
            <X aria-hidden='true' />
          </Button>
          {panel && (
            <div className='min-h-0 space-y-5 overflow-y-auto overscroll-contain'>
              <div className='space-y-2'>
                <h2 className='text-lg font-semibold break-words'>
                  {panel.item.title}
                </h2>
              </div>
              {panel.mode === 'preview' ? (
                <AnnouncementContent content={panel.item.content} />
              ) : panel.item.readership ? (
                <dl className='grid grid-cols-2 gap-4'>
                  {[
                    ['recipients', panel.item.readership.recipients],
                    ['read', panel.item.readership.read],
                    [
                      'unread',
                      panel.item.readership.recipients -
                        panel.item.readership.read,
                    ],
                    [
                      'readRate',
                      `${Math.round((panel.item.readership.read / Math.max(1, panel.item.readership.recipients)) * 100)}%`,
                    ],
                  ].map(([key, value]) => (
                    <div key={key} className='space-y-2 rounded-md border p-4'>
                      <dt className='text-xs text-muted-foreground'>
                        {t(`announcements.${key}`)}
                      </dt>
                      <dd className='text-2xl font-semibold tabular-nums'>
                        {typeof value === 'number'
                          ? new Intl.NumberFormat(i18n.language).format(value)
                          : value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className='py-12 text-center text-sm text-muted-foreground'>
                  {t('announcements.noStats')}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
