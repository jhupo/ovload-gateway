import { useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ModelKey, ModelKeyGroup, ModelKeyInput } from '@/api/model-keys'
import { hasIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'

export function KeyEditor({
  record,
  groups,
  pending,
  onSave,
  onClose,
}: {
  record?: ModelKey
  groups: ModelKeyGroup[]
  pending: boolean
  onSave: (input: ModelKeyInput, group: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`liveKeys.${key}`)
  const [initial] = useState(() => ({
    name: record?.name ?? '',
    group: record?.group_id ?? groups[0]?.id ?? '',
    concurrency: String(record?.limits.max_concurrency ?? 4),
    rpm: String(record?.limits.requests_per_minute ?? 60),
    expires: record?.expires_at?.slice(0, 16) ?? '',
  }))
  const [draft, setDraft] = useState(initial)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [discard, setDiscard] = useState(false)
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft)
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && hasIdentitySession(),
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const close = () => {
    if (pending) return
    if (dirty) setDiscard(true)
    else onClose()
  }
  const change = (field: keyof typeof draft, value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }))
  function submit() {
    const issue =
      !draft.name.trim() ||
      new TextEncoder().encode(draft.name.trim()).length > 160 ||
      /\p{Cc}/u.test(draft.name)
        ? 'name'
        : !record && !groups.some((group) => group.id === draft.group)
          ? 'group'
          : !/^\d{1,5}$/.test(draft.concurrency) ||
              Number(draft.concurrency) < 1 ||
              Number(draft.concurrency) > 10000
            ? 'concurrency'
            : !/^\d{1,7}$/.test(draft.rpm) ||
                Number(draft.rpm) < 1 ||
                Number(draft.rpm) > 1000000
              ? 'rpm'
              : draft.expires &&
                  (!Number.isFinite(Date.parse(draft.expires + ':00Z')) ||
                    Date.parse(draft.expires + ':00Z') <= Date.now())
                ? 'expires'
                : null
    setInvalid(issue)
    if (issue) {
      toast.error(tr('invalid'), { id: 'model-key-validation' })
      document.getElementById(`live-key-${issue}`)?.focus()
      return
    }
    toast.dismiss('model-key-validation')
    onSave(
      {
        name: draft.name.trim(),
        limits: {
          max_concurrency: Number(draft.concurrency),
          requests_per_minute: Number(draft.rpm),
        },
        expires_at: draft.expires
          ? new Date(draft.expires + ':00Z').toISOString()
          : null,
      },
      draft.group
    )
  }
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          onInteractOutside={(event) => {
            if (dirty || pending) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>{tr(record ? 'edit' : 'create')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('title')}
            </DialogDescription>
          </DialogHeader>
          <form
            id='live-key-editor'
            className='grid gap-4'
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (!pending) submit()
            }}
          >
            <div className='grid gap-2'>
              <Label htmlFor='live-key-name'>{tr('name')}</Label>
              <Input
                id='live-key-name'
                value={draft.name}
                aria-invalid={invalid === 'name'}
                onChange={(event) => change('name', event.target.value)}
              />
            </div>
            {!record && (
              <div className='grid gap-2'>
                <Label htmlFor='live-key-group'>{tr('group')}</Label>
                <Select
                  value={draft.group}
                  onValueChange={(value) => change('group', value)}
                >
                  <SelectTrigger
                    id='live-key-group'
                    className='w-full'
                    aria-invalid={invalid === 'group'}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className='grid grid-cols-2 gap-4'>
              {(['concurrency', 'rpm'] as const).map((field) => (
                <div className='grid gap-2' key={field}>
                  <Label htmlFor={`live-key-${field}`}>{tr(field)}</Label>
                  <Input
                    id={`live-key-${field}`}
                    type='number'
                    min='1'
                    max={field === 'rpm' ? 1000000 : 10000}
                    step='1'
                    value={draft[field]}
                    aria-invalid={invalid === field}
                    onChange={(event) => change(field, event.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='live-key-expires'>{tr('expires')}</Label>
              <Input
                id='live-key-expires'
                type='datetime-local'
                value={draft.expires}
                aria-invalid={invalid === 'expires'}
                onChange={(event) => change('expires', event.target.value)}
              />
            </div>
            {invalid && (
              <span className='sr-only' role='alert'>
                {tr('invalid')}
              </span>
            )}
          </form>
          <DialogFooter>
            <Button variant='outline' disabled={pending} onClick={close}>
              {tr('cancel')}
            </Button>
            <Button form='live-key-editor' type='submit' disabled={pending}>
              {tr('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setDiscard(false)
            blocker.reset?.()
          }
        }}
        title={tr('discard')}
        desc={<span className='sr-only'>{tr('discard')}</span>}
        confirmText={tr('discard')}
        destructive
        handleConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed()
          else onClose()
        }}
      />
    </>
  )
}
