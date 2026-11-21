import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  modelKeys,
  type IssuedModelKey,
  type ModelKey,
  type ModelKeyInput,
} from '@/api/model-keys'
import { useIdentitySession } from '@/stores/identity-session'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableFrame } from '@/components/data-table/frame'
import { Main } from '@/components/layout/main'
import { RequestErrorToast } from '@/components/request-error-toast'
import { KeyEditor } from './editor'

type Command =
  | { type: 'create'; input: ModelKeyInput; group: string }
  | { type: 'edit'; record: ModelKey; input: ModelKeyInput }
  | { type: 'toggle' | 'rotate' | 'revoke'; record: ModelKey }

export function ApiKeys() {
  const sessionId = useIdentitySession((state) => state.session?.id)
  return <ApiKeysContent key={sessionId ?? 'signed-out'} />
}

function ApiKeysContent() {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`liveKeys.${key}`)
  const session = useIdentitySession((state) => state.session)
  const owner = session?.id
  const client = useQueryClient()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [editor, setEditor] = useState<{ record?: ModelKey } | null>(null)
  const [confirmation, setConfirmation] = useState<{
    type: 'rotate' | 'revoke'
    record: ModelKey
  } | null>(null)
  const [issued, setIssued] = useState<{
    owner: string
    value: IssuedModelKey
  } | null>(null)
  const pendingCommand = useRef<{ signature: string; key: string } | null>(null)
  const page = cursors.length - 1
  const keys = useQuery({
    queryKey: ['model-keys', owner, cursors[page]],
    queryFn: ({ signal }) => modelKeys.list(cursors[page], signal),
    enabled: session?.audience === 'customer',
    retry: false,
  })
  const groups = useQuery({
    queryKey: ['model-key-groups', owner],
    queryFn: ({ signal }) => modelKeys.groups(signal),
    enabled: session?.audience === 'customer',
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: async (command: Command & { owner: string }) => {
      if (useIdentitySession.getState().session?.id !== command.owner)
        throw new Error(tr('sessionExpired'))
      const signature = JSON.stringify(command)
      if (pendingCommand.current?.signature !== signature)
        pendingCommand.current = { signature, key: crypto.randomUUID() }
      if (command.type === 'create')
        return modelKeys.create(
          { ...command.input, group_id: command.group },
          pendingCommand.current.key
        )
      if (command.type === 'rotate')
        return modelKeys.rotate(command.record, pendingCommand.current.key)
      if (command.type === 'revoke') return modelKeys.revoke(command.record)
      const input =
        command.type === 'edit'
          ? command.input
          : {
              name: command.record.name,
              limits: command.record.limits,
              expires_at: command.record.expires_at,
            }
      return modelKeys.update(command.record, {
        ...input,
        enabled:
          command.type === 'toggle'
            ? !command.record.enabled
            : command.record.enabled,
      })
    },
    onSuccess: (result, command) => {
      if (useIdentitySession.getState().session?.id !== command.owner) return
      pendingCommand.current = null
      setEditor(null)
      setConfirmation(null)
      if ('key' in result) {
        setIssued({ owner: command.owner, value: result })
        if (!result.secret_disclosed) toast.warning(tr('secretUnavailable'))
      }
      void client.invalidateQueries({
        queryKey: ['model-keys', command.owner],
      })
      toast.success(tr('saved'))
    },
    onError: (error, command) => {
      if (useIdentitySession.getState().session?.id === command.owner)
        toast.error(error.message, { id: 'model-key-request' })
    },
  })
  const sendCommand = (command: Command) => {
    if (owner) mutation.mutate({ ...command, owner })
  }
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(new Date(value))
      : tr('never')
  const status = (record: ModelKey) =>
    record.revoked_at
      ? 'revoked'
      : !record.enabled
        ? 'disabled'
        : record.expires_at && Date.parse(record.expires_at) <= Date.now()
          ? 'expired'
          : 'active'
  const columns: ColumnDef<ModelKey>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('name')} />
      ),
      cell: ({ row }) => (
        <span
          className='block max-w-48 truncate font-medium'
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'prefix',
      header: tr('key'),
      cell: ({ row }) => (
        <code className='font-mono text-xs'>{row.original.prefix}...</code>
      ),
    },
    {
      accessorKey: 'group_id',
      header: tr('group'),
      cell: ({ row }) =>
        groups.data?.find((group) => group.id === row.original.group_id)
          ?.name ?? row.original.group_id,
    },
    {
      id: 'status',
      accessorFn: status,
      header: tr('status'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => (
        <Badge variant='secondary'>{tr(status(row.original))}</Badge>
      ),
    },
    {
      id: 'concurrency',
      accessorFn: (record) => record.limits.max_concurrency,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('concurrency')} />
      ),
    },
    {
      id: 'rpm',
      accessorFn: (record) => record.limits.requests_per_minute,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('rpm')} />
      ),
    },
    {
      accessorKey: 'expires_at',
      header: tr('expires'),
      cell: ({ row }) => date(row.original.expires_at),
    },
    {
      id: 'actions',
      enableHiding: false,
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='size-8'
              disabled={mutation.isPending || !!row.original.revoked_at}
              aria-label={tr('actions')}
              title={tr('actions')}
            >
              <MoreHorizontal className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              onSelect={() => setEditor({ record: row.original })}
            >
              {tr('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                sendCommand({ type: 'toggle', record: row.original })
              }
            >
              {tr(row.original.enabled ? 'disable' : 'enable')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                setConfirmation({ type: 'rotate', record: row.original })
              }
            >
              {tr('rotate')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className='text-destructive'
              onSelect={() =>
                setConfirmation({ type: 'revoke', record: row.original })
              }
            >
              {tr('revoke')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  const pagination = (
    <div className='flex items-center justify-end gap-2'>
      <Button
        variant='outline'
        size='icon'
        className='size-8'
        aria-label={tr('previous')}
        title={tr('previous')}
        disabled={page === 0 || keys.isFetching}
        onClick={() => setCursors((values) => values.slice(0, -1))}
      >
        <ChevronLeft className='size-4' />
      </Button>
      <span className='min-w-10 text-center text-sm tabular-nums'>
        {page + 1}
      </span>
      <Button
        variant='outline'
        size='icon'
        className='size-8'
        aria-label={tr('next')}
        title={tr('next')}
        disabled={
          !keys.data?.next_cursor || keys.isFetching || cursors.length >= 1000
        }
        onClick={() =>
          setCursors((values) => [...values, keys.data!.next_cursor!])
        }
      >
        <ChevronRight className='size-4' />
      </Button>
    </div>
  )
  return (
    <Main>
      <div
        data-slot='page-heading'
        className='flex flex-wrap items-center justify-between gap-3'
      >
        <h1 className='text-2xl font-bold'>{tr('title')}</h1>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            title={tr('refresh')}
            aria-label={tr('refresh')}
            disabled={keys.isFetching}
            onClick={() => {
              void keys.refetch()
              void groups.refetch()
            }}
          >
            <RefreshCw
              className={`size-4 ${keys.isFetching ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button
            className='h-8'
            size='sm'
            disabled={!groups.data?.length || groups.isError}
            onClick={() => setEditor({})}
          >
            <Plus className='size-4' />
            {tr('create')}
          </Button>
        </div>
      </div>
      {keys.isPending ? (
        <div
          role='status'
          className='py-12 text-center text-sm text-muted-foreground'
        >
          {tr('loading')}
        </div>
      ) : keys.isError ? (
        <RequestErrorToast message={keys.error.message} />
      ) : (
        <DataTableFrame
          pagination={pagination}
          data={keys.data.items}
          columns={columns}
          label={tr('title')}
          searchPlaceholder={tr('search')}
          searchText={(record) =>
            `${record.name} ${record.prefix} ${record.group_id}`
          }
          facetedFilters={[
            {
              columnId: 'status',
              title: tr('status'),
              options: ['active', 'disabled', 'expired', 'revoked'].map(
                (value) => ({ value, label: tr(value) })
              ),
            },
          ]}
        />
      )}
      {groups.isError && <RequestErrorToast message={groups.error.message} />}
      {editor && (
        <KeyEditor
          record={editor.record}
          groups={groups.data ?? []}
          pending={mutation.isPending}
          onClose={() => setEditor(null)}
          onSave={(input, group) =>
            sendCommand(
              editor.record
                ? { type: 'edit', record: editor.record, input }
                : { type: 'create', input, group }
            )
          }
        />
      )}
      <ConfirmDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setConfirmation(null)
        }}
        title={tr(confirmation?.type ?? 'revoke')}
        desc={tr(
          confirmation?.type === 'rotate' ? 'rotateWarning' : 'revokeWarning'
        )}
        confirmText={tr(confirmation?.type ?? 'revoke')}
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (confirmation) sendCommand(confirmation)
        }}
      />
      <Dialog
        open={issued?.owner === owner && !!issued?.value.secret}
        onOpenChange={(open) => {
          if (!open) setIssued(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('newSecret')}</DialogTitle>
            <DialogDescription>{tr('secretWarning')}</DialogDescription>
          </DialogHeader>
          <div className='flex min-w-0 items-center gap-2'>
            <Input
              aria-label={tr('key')}
              readOnly
              value={issued?.value.secret ?? ''}
              className='min-w-0 font-mono text-xs'
            />
            <Button
              size='icon'
              variant='outline'
              className='shrink-0'
              title={tr('copy')}
              aria-label={tr('copy')}
              onClick={() => {
                if (issued?.value.secret)
                  void navigator.clipboard.writeText(issued.value.secret).then(
                    () => toast.success(tr('copied')),
                    () => toast.error(tr('copyFailed'))
                  )
              }}
            >
              <Copy className='size-4' />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Main>
  )
}
