import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfigurationSection } from '@/components/configuration-section'
import { DatePicker } from '@/components/date-picker'
import ConfirmationButtonGroup from '@/components/shadcn-space/button-group/button-group-11'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { type Agreement } from './agreement'

export function AgreementSettings({
  value,
  onChange,
  error,
}: {
  value: Agreement
  onChange: (value: Agreement) => void
  error?: string
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('generalSettings.' + key)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', slug: '', content: '' })
  const [invalid, setInvalid] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const dirty = !!(draft.title || draft.slug || draft.content)
  const patch = (next: Partial<Agreement>) => onChange({ ...value, ...next })
  return (
    <ConfigurationSection
      title={tr('agreement')}
      action={
        <div className='ms-auto flex max-w-full flex-wrap items-center justify-start gap-2 sm:justify-end'>
          <ConfirmationButtonGroup
            value={value.mode}
            onValueChange={(mode) => patch({ mode })}
            label={tr('mode')}
            modalLabel={tr('modal')}
            checkboxLabel={tr('checkbox')}
          />
          <div className='w-32 sm:w-36 [&>button]:h-8 [&>button]:w-full [&>button]:rounded-md [&>button]:px-3'>
            <DatePicker
              label={tr('updated')}
              placeholder={tr('updated')}
              selected={
                value.updated
                  ? new Date(value.updated + 'T00:00:00')
                  : undefined
              }
              onSelect={(date) =>
                patch({
                  updated: date
                    ? [
                        date.getFullYear(),
                        String(date.getMonth() + 1).padStart(2, '0'),
                        String(date.getDate()).padStart(2, '0'),
                      ].join('-')
                    : '',
                })
              }
            />
          </div>
          <Button
            ref={addRef}
            type='button'
            variant='outline'
            className='h-8'
            disabled={value.documents.length >= 10}
            onClick={() => {
              setDraft({ title: '', slug: '', content: '' })
              setInvalid(false)
              setOpen(true)
            }}
          >
            <Plus className='size-4' aria-hidden='true' />
            {tr('addDocument')}
          </Button>
          <SwitchLabeled
            size='sm'
            containedMotion
            aria-label={tr('agreement')}
            checked={value.enabled}
            onCheckedChange={(enabled) => patch({ enabled })}
          />
        </div>
      }
    >
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {!value.documents.length && (
        <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
          {tr('noDocuments')}
        </div>
      )}
      {value.documents.map((doc, index) => (
        <ConfigurationSection
          key={doc.id}
          title={doc.title || tr('untitled')}
          action={
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-8'
              disabled={value.enabled && value.documents.length === 1}
              aria-label={tr('removeDocument') + ' ' + (index + 1)}
              onClick={() =>
                patch({
                  documents: value.documents.filter((d) => d.id !== doc.id),
                })
              }
            >
              <Trash2 aria-hidden='true' className='size-4' />
            </Button>
          }
        >
          <div className='grid gap-4 @lg/settings:grid-cols-2'>
            <div className='min-w-0 flex-1 space-y-2'>
              <Label htmlFor={'title-' + doc.id}>{tr('documentTitle')}</Label>
              <Input
                id={'title-' + doc.id}
                aria-invalid={!!error && value.enabled && !doc.title.trim()}
                maxLength={80}
                value={doc.title}
                onChange={(e) =>
                  patch({
                    documents: value.documents.map((d) =>
                      d.id === doc.id ? { ...d, title: e.target.value } : d
                    ),
                  })
                }
              />
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor={'slug-' + doc.id}>{tr('slug')}</Label>
              <div className='flex items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring'>
                <span className='border-r px-3 text-sm text-muted-foreground'>
                  /legal/
                </span>
                <Input
                  id={'slug-' + doc.id}
                  aria-invalid={
                    !!error &&
                    (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(doc.slug.trim()) ||
                      value.documents.some(
                        (other) =>
                          other.id !== doc.id &&
                          other.slug.trim() === doc.slug.trim()
                      ))
                  }
                  className='min-w-0 border-0 shadow-none focus-visible:ring-0'
                  value={doc.slug}
                  maxLength={80}
                  spellCheck={false}
                  onChange={(e) =>
                    patch({
                      documents: value.documents.map((d) =>
                        d.id === doc.id ? { ...d, slug: e.target.value } : d
                      ),
                    })
                  }
                />
              </div>
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor={'content-' + doc.id}>{tr('markdown')}</Label>
            <Textarea
              id={'content-' + doc.id}
              aria-invalid={!!error && value.enabled && !doc.content.trim()}
              className='min-h-36 resize-y'
              maxLength={30000}
              value={doc.content}
              onChange={(e) =>
                patch({
                  documents: value.documents.map((d) =>
                    d.id === doc.id ? { ...d, content: e.target.value } : d
                  ),
                })
              }
            />
          </div>
        </ConfigurationSection>
      ))}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || !dirty) setOpen(next)
        }}
      >
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto sm:max-w-xl'
          showCloseButton={!dirty}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            addRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{tr('addDocument')}</DialogTitle>
          </DialogHeader>
          <form
            className='space-y-4'
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const title = draft.title.trim(),
                slug = draft.slug.trim(),
                content = draft.content.trim()
              if (!title || !content) {
                setInvalid(true)
                toast.error(tr('documentRequired'))
                return
              }
              if (
                !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(slug) ||
                value.documents.some((doc) => doc.slug.trim() === slug)
              ) {
                setInvalid(true)
                toast.error(tr('slugError'))
                return
              }
              patch({
                documents: [
                  ...value.documents,
                  { id: crypto.randomUUID(), title, slug, content },
                ],
              })
              setOpen(false)
            }}
          >
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='new-document-title'>
                  {tr('documentTitle')}
                </Label>
                <Input
                  id='new-document-title'
                  value={draft.title}
                  maxLength={80}
                  aria-invalid={invalid && !draft.title.trim()}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='new-document-slug'>{tr('slug')}</Label>
                <Input
                  id='new-document-slug'
                  value={draft.slug}
                  maxLength={80}
                  spellCheck={false}
                  aria-invalid={
                    invalid &&
                    (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(draft.slug.trim()) ||
                      value.documents.some(
                        (doc) => doc.slug.trim() === draft.slug.trim()
                      ))
                  }
                  onChange={(event) =>
                    setDraft({ ...draft, slug: event.target.value })
                  }
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='new-document-content'>{tr('markdown')}</Label>
              <Textarea
                id='new-document-content'
                className='min-h-40'
                value={draft.content}
                maxLength={30000}
                aria-invalid={invalid && !draft.content.trim()}
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
              />
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type='submit'>{tr('addDocument')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ConfigurationSection>
  )
}
