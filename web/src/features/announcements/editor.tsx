import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, List, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccountGroupOption } from '@/api/account-groups'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateTimePicker } from '@/components/date-time-picker'
import { AnnouncementContent } from './content'
import { type Announcement, localDateInput } from './data'

export function AnnouncementEditor({
  item,
  groups,
  busy,
  onSave,
  onClose,
  restoreFocus,
}: {
  item?: Announcement
  groups: AccountGroupOption[]
  busy: boolean
  onSave: (
    document: Pick<
      Announcement,
      | 'title'
      | 'content'
      | 'status'
      | 'delivery'
      | 'groupIds'
      | 'startsAt'
      | 'endsAt'
    >
  ) => Promise<void>
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const [initial] = useState(() => ({
    title: item?.title ?? '',
    content: item?.content ?? '',
    status: item?.status ?? 'draft',
    delivery: item?.delivery ?? 'silent',
    audience: item?.groupIds.length ? 'conditional' : 'all',
    groupIds: item?.groupIds ?? [],
    start: localDateInput(item?.startsAt ?? null),
    end: localDateInput(item?.endsAt ?? null),
  }))
  const [draft, setDraft] = useState(initial)
  const [tab, setTab] = useState('edit')
  const [query, setQuery] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [discard, setDiscard] = useState(false)
  const content = useRef<HTMLTextAreaElement>(null)
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft)
  const close = () => (dirty ? setDiscard(true) : onClose())
  const change = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K]
  ) => setDraft((previous) => ({ ...previous, [key]: value }))
  const errors = {
    title: !draft.title.trim(),
    content: !draft.content.trim(),
    time:
      (!!draft.start && !Number.isFinite(Date.parse(draft.start))) ||
      (!!draft.end &&
        (!Number.isFinite(Date.parse(draft.end)) ||
          Date.parse(draft.end) <=
            (draft.start ? Date.parse(draft.start) : -Infinity))),
    groups: draft.audience === 'conditional' && !draft.groupIds.length,
  }
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  const insert = (prefix: string, suffix: string) => {
    const field = content.current
    if (!field) return
    const start = field.selectionStart,
      end = field.selectionEnd
    change(
      'content',
      draft.content.slice(0, start) +
        prefix +
        draft.content.slice(start, end) +
        suffix +
        draft.content.slice(end)
    )
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + prefix.length, end + prefix.length)
    })
  }
  const error = (key: string) => (
    <p role='alert' className='sr-only'>
      {t(`announcements.${key}`)}
    </p>
  )
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className='flex h-[100dvh] max-h-[100dvh] max-w-full flex-col gap-0 overflow-clip rounded-none p-0 sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-3xl sm:rounded-xl'
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 border-b px-5 py-4 text-left sm:px-6'>
            <DialogTitle className='flex items-center gap-3 pr-10'>
              {t(`announcements.${item ? 'edit' : 'create'}`)}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {t('announcements.title')}
            </DialogDescription>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='absolute top-2.5 right-3'
              aria-label={t('announcements.close')}
              onClick={close}
            >
              <X aria-hidden='true' />
            </Button>
          </DialogHeader>
          <form
            id='announcement-editor'
            noValidate
            className='relative min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6'
            onSubmit={(event) => {
              event.preventDefault()
              setInvalid(true)
              if (busy) return
              if (Object.values(errors).some(Boolean)) {
                toast.error(t(`announcements.${errors.title ? 'requiredTitle' : errors.content ? 'requiredBody' : errors.time ? 'invalidTime' : 'requiredGroup'}`))
                return
              }
              void onSave({
                title: draft.title.trim(),
                content: draft.content,
                status: draft.status,
                delivery: draft.delivery,
                groupIds: draft.audience === 'all' ? [] : draft.groupIds,
                startsAt: draft.start
                  ? new Date(draft.start).toISOString()
                  : null,
                endsAt: draft.end ? new Date(draft.end).toISOString() : null,
              }).catch(() => {})
            }}
          >
            <fieldset disabled={busy} className='contents'>
              <div className='space-y-2'>
                <Label htmlFor='announcement-title'>
                  {t('announcements.subject')}
                </Label>
                <Input
                  id='announcement-title'
                  name='title'
                  autoComplete='off'
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => change('title', e.target.value)}
                  aria-invalid={invalid && errors.title}
                />
                {invalid && errors.title && error('requiredTitle')}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='announcement-content'>
                  {t('announcements.body')}
                </Label>
                <Tabs
                  value={tab}
                  onValueChange={setTab}
                  className='gap-0 overflow-hidden rounded-md border'
                >
                  <div className='flex items-center gap-2 border-b p-2'>
                    <TabsList className='h-8'>
                      <TabsTrigger value='edit'>
                        {t('announcements.editTab')}
                      </TabsTrigger>
                      <TabsTrigger value='preview'>
                        {t('announcements.previewTab')}
                      </TabsTrigger>
                    </TabsList>
                    {tab === 'edit' && (
                      <div className='flex border-l pl-2'>
                        {[
                          {
                            key: 'bold',
                            icon: Bold,
                            prefix: '**',
                            suffix: '**',
                          },
                          {
                            key: 'italic',
                            icon: Italic,
                            prefix: '*',
                            suffix: '*',
                          },
                          {
                            key: 'list',
                            icon: List,
                            prefix: '\n- ',
                            suffix: '',
                          },
                        ].map((action) => (
                          <Button
                            key={action.key}
                            type='button'
                            variant='ghost'
                            size='icon'
                            className='size-8'
                            aria-label={t(`announcements.${action.key}`)}
                            onClick={() => insert(action.prefix, action.suffix)}
                          >
                            <action.icon
                              className='size-4'
                              aria-hidden='true'
                            />
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <TabsContent value='edit' className='m-0'>
                    <Textarea
                      ref={content}
                      id='announcement-content'
                      name='content'
                      maxLength={20000}
                      className='min-h-40 resize-y rounded-none border-0 shadow-none focus-visible:ring-inset'
                      value={draft.content}
                      aria-invalid={invalid && errors.content}
                      onChange={(e) => change('content', e.target.value)}
                    />
                  </TabsContent>
                  <TabsContent value='preview' className='m-0 min-h-40 p-4'>
                    <AnnouncementContent content={draft.content} />
                  </TabsContent>
                </Tabs>
                {invalid && errors.content && error('requiredBody')}
              </div>
              <div className='grid grid-cols-2 gap-4'>
                {(['status', 'delivery'] as const).map((key) => (
                  <div key={key} className='min-w-0 space-y-2'>
                    <Label htmlFor={`announcement-${key}`}>
                      {t(`announcements.${key}`)}
                    </Label>
                    <Select
                      value={draft[key]}
                      onValueChange={(v) =>
                        key === 'status'
                          ? change('status', v as Announcement['status'])
                          : change('delivery', v as Announcement['delivery'])
                      }
                    >
                      <SelectTrigger
                        id={`announcement-${key}`}
                        className='w-full'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(key === 'status'
                          ? ['draft', 'published', 'archived']
                          : ['silent', 'popup']
                        ).map((v) => (
                          <SelectItem key={v} value={v}>
                            {t(`announcements.${v}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <fieldset className='space-y-3'>
                <legend className='text-sm font-medium'>
                  {t('announcements.dateZone', {
                    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  })}
                </legend>
                <div className='grid gap-4 sm:grid-cols-2'>
                  {(['start', 'end'] as const).map((key) => (
                    <div key={key} className='min-w-0 space-y-2'>
                      <Label htmlFor={`announcement-${key}`}>
                        {t(`announcements.${key}`)}
                      </Label>
                      <DateTimePicker
                        id={`announcement-${key}`}
                        value={draft[key]}
                        label={t(`announcements.${key}`)}
                        onChange={(value) => change(key, value)}
                        aria-invalid={invalid && errors.time}
                      />
                    </div>
                  ))}
                </div>
                {invalid && errors.time && error('invalidTime')}
              </fieldset>
              <fieldset className='space-y-3 border-t pt-4'>
                <legend className='sr-only'>
                  {t('announcements.audience')}
                </legend>
                <div className='text-sm font-medium'>
                  {t('announcements.audience')}
                </div>
                <RadioGroup
                  value={draft.audience}
                  onValueChange={(v) => change('audience', v)}
                  className='flex flex-wrap gap-5'
                >
                  {['all', 'conditional'].map((v) => (
                    <div key={v} className='relative flex items-center gap-2'>
                      <RadioGroupItem value={v} id={`audience-${v}`} />
                      <Label
                        htmlFor={`audience-${v}`}
                        className='py-1 font-normal'
                      >
                        {t(`announcements.${v === 'all' ? 'allUsers' : v}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {draft.audience === 'conditional' && (
                  <div className='space-y-2'>
                    <div className='flex justify-between text-sm'>
                      <Label htmlFor='announcement-groups'>
                        {t('announcements.groups')}
                      </Label>
                      <span className='text-xs text-muted-foreground'>
                        {t('announcements.selectedGroups', {
                          count: draft.groupIds.length,
                        })}
                      </span>
                    </div>
                    <div className='rounded-md border'>
                      <div className='border-b p-2'>
                        <Input
                          id='announcement-groups'
                          placeholder={t('announcements.searchGroups')}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          aria-invalid={invalid && errors.groups}
                        />
                      </div>
                      <div className='max-h-40 overflow-y-auto overscroll-contain p-2'>
                        {groups
                          .filter((g) =>
                            g.name.toLowerCase().includes(query.toLowerCase())
                          )
                          .map((g) => (
                            <label
                              key={g.id}
                              className='relative flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted'
                            >
                              <Checkbox
                                checked={draft.groupIds.includes(g.id)}
                                onCheckedChange={(checked) =>
                                  change(
                                    'groupIds',
                                    checked
                                      ? [...draft.groupIds, g.id]
                                      : draft.groupIds.filter(
                                          (id) => id !== g.id
                                        )
                                  )
                                }
                              />
                              <span className='min-w-0 truncate text-sm'>
                                {g.name}
                              </span>
                            </label>
                          ))}
                        {!groups.some((g) =>
                          g.name.toLowerCase().includes(query.toLowerCase())
                        ) && (
                          <p className='p-3 text-sm text-muted-foreground'>
                            {t('common.no_data')}
                          </p>
                        )}
                      </div>
                    </div>
                    {invalid && errors.groups && error('requiredGroup')}
                  </div>
                )}
              </fieldset>
            </fieldset>
          </form>
          <DialogFooter className='shrink-0 flex-row justify-end gap-2 border-t bg-background px-5 py-4 sm:px-6'>
            <Button variant='outline' onClick={close}>
              {t('announcements.cancel')}
            </Button>
            <Button type='submit' form='announcement-editor' disabled={busy}>
              {t('announcements.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t('announcements.discard')}
        desc={<span className='sr-only'>{t('announcements.title')}</span>}
        confirmText={t('announcements.discardAction')}
        handleConfirm={() => {
          setDiscard(false)
          onClose()
        }}
      />
    </>
  )
}
