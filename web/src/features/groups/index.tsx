import { useRef, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { SortingState } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  createAccountGroup,
  deleteAccountGroup,
  listAccountGroups,
  setAccountGroupEnabled,
  updateAccountGroup,
  type AccountGroup,
  type GroupFields,
} from '@/api/account-groups'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import { GroupEditor } from './components/group-editor'
import { GroupOverrides } from './components/group-overrides'
import { GroupsTable } from './components/groups-table'

const route = getRouteApi('/_authenticated/groups/')

export function Groups() {
  const sessionId = useIdentitySession((state) => state.session?.id)
  return <GroupsContent key={sessionId ?? 'signed-out'} />
}

type Command =
  | { type: 'create'; fields: GroupFields }
  | {
      type: 'edit'
      record: AccountGroup
      fields: GroupFields
      revision: number
    }
  | { type: 'toggle' | 'delete'; record: AccountGroup }

function GroupsContent() {
  const { t } = useTranslation()
  const tr = (key: string) => t(`channelGroups.${key}`)
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const session = useIdentitySession((state) => state.session)
  const grants = useIdentitySession((state) => state.grants)
  const owner = session?.id
  const readable =
    session?.audience === 'management' && allows('provider_accounts.read')
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([])
  const [editor, setEditor] = useState<{
    record?: AccountGroup
    revision: number
  } | null>(null)
  const [overrides, setOverrides] = useState<{
    record: AccountGroup
    revision: number
  } | null>(null)
  const [removing, setRemoving] = useState<AccountGroup | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const restoreFocus = () => trigger.current?.focus()
  const status = search.status ?? []
  const enabled = status.length === 1 ? status[0] === 'active' : undefined
  const sort = sorting[0]?.id === 'name' ? 'name' : 'createdAt'
  const descending = sorting[0]?.desc ?? true
  const page = useQuery({
    queryKey: [
      'account-groups',
      owner,
      grants,
      search.page ?? 1,
      search.pageSize ?? 10,
      search.query ?? '',
      enabled,
      search.platform,
      search.visibility,
      sort,
      descending,
    ],
    queryFn: ({ signal }) =>
      listAccountGroups(
        {
          page: search.page ?? 1,
          pageSize: search.pageSize ?? 10,
          search: search.query?.trim(),
          enabled,
          platform: search.platform?.join(','),
          visibility: search.visibility?.join(','),
          sort,
          descending,
        },
        signal
      ),
    enabled: readable,
    placeholderData: keepPreviousData,
    retry: false,
    refetchInterval: 5000,
  })
  const mutation = useMutation({
    mutationFn: async (command: Command & { owner: string }) => {
      if (useIdentitySession.getState().session?.id !== command.owner)
        throw new Error(tr('sessionExpired'))
      if (!allows('provider_accounts.manage'))
        throw new Error(t('identity.errors.forbidden'))
      if (command.type === 'create') return createAccountGroup(command.fields)
      if (command.type === 'edit')
        return updateAccountGroup(
          command.record.id,
          command.fields,
          command.revision
        )
      if (command.type === 'toggle')
        return setAccountGroupEnabled(
          command.record.id,
          !command.record.enabled
        )
      return deleteAccountGroup(command.record.id)
    },
    onSuccess: (_result, command) => {
      if (useIdentitySession.getState().session?.id !== command.owner) return
      setEditor(null)
      setOverrides(null)
      setRemoving(null)
      void queryClient.invalidateQueries({
        queryKey: ['account-groups', command.owner],
      })
      void queryClient.invalidateQueries({
        queryKey: ['account-group-options', command.owner],
      })
      void queryClient.invalidateQueries({ queryKey: ['model-key-groups'] })
      toast.success(tr('saved'))
    },
    onError: (error, command) => {
      if (useIdentitySession.getState().session?.id === command.owner)
        toast.error(error.message, { id: 'channel-group-request' })
    },
  })
  const send = (command: Command) => {
    if (owner) mutation.mutate({ ...command, owner })
  }
  const writable = allows('provider_accounts.manage')
  const openEditor = (record?: AccountGroup, button?: HTMLButtonElement) => {
    if (!page.data) return
    if (button) trigger.current = button
    setEditor({ record, revision: page.data.configRevision })
  }
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 flex-wrap items-center justify-between gap-3'
        >
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing page heading pattern; the project has no shared Heading component. */}
          <h1 className='text-2xl font-semibold'>{tr('title')}</h1>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='icon-sm'
              aria-label={tr('refresh')}
              title={tr('refresh')}
              disabled={page.isFetching}
              onClick={() => void page.refetch()}
            >
              <RefreshCw className='size-4' />
            </Button>
            <Button
              disabled={!writable || !page.data || mutation.isPending}
              onClick={(event) => openEditor(undefined, event.currentTarget)}
            >
              <Plus />
              {tr('create')}
            </Button>
          </div>
        </div>
        {readable && page.error && (
          <RequestErrorToast message={page.error.message} />
        )}
        <GroupsTable
          data={readable ? (page.data?.items ?? []) : []}
          total={readable ? (page.data?.page.total ?? 0) : 0}
          loading={readable && page.isPending}
          loaded={readable && page.data !== undefined}
          error={
            !readable
              ? t('identity.permissionRequired')
              : page.isError
                ? ''
                : undefined
          }
          search={search}
          navigate={navigate}
          sorting={sorting}
          onSortingChange={setSorting}
          writable={writable}
          pending={mutation.isPending}
          onEdit={(record, button) => openEditor(record, button)}
          onOverrides={(record, button) => {
            if (page.data) {
              trigger.current = button
              setOverrides({ record, revision: page.data.configRevision })
            }
          }}
          onToggle={(record) => send({ type: 'toggle', record })}
          onDelete={(record, button) => {
            trigger.current = button
            setRemoving(record)
          }}
        />
      </Main>
      {editor && writable && (
        <GroupEditor
          record={editor.record}
          pending={mutation.isPending}
          onClose={() => setEditor(null)}
          restoreFocus={restoreFocus}
          onSave={(fields) =>
            send(
              editor.record
                ? {
                    type: 'edit',
                    record: editor.record,
                    fields,
                    revision: editor.revision,
                  }
                : { type: 'create', fields }
            )
          }
        />
      )}
      {overrides && (
        <GroupOverrides
          group={overrides.record}
          pending={mutation.isPending}
          writable={writable}
          onClose={() => setOverrides(null)}
          restoreFocus={restoreFocus}
          onSave={(fields) =>
            send({
              type: 'edit',
              record: overrides.record,
              revision: overrides.revision,
              fields,
            })
          }
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setRemoving(null)
        }}
        title={tr('delete')}
        desc={tr('deleteWarning')}
        confirmText={tr('delete')}
        destructive
        isLoading={mutation.isPending}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
        handleConfirm={() => {
          if (removing) send({ type: 'delete', record: removing })
        }}
      >
        <div className='text-sm font-medium break-words'>{removing?.name}</div>
      </ConfirmDialog>
    </>
  )
}
