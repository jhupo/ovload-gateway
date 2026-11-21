import { useRef, useState } from 'react'
import { Eye, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  defaultTemplate,
  previewTemplate,
  templateEvents,
  templateLocales,
  templateVariables,
  type EmailTemplate,
  type EmailTemplates,
  type TemplateEvent,
  type TemplateIssue,
  type TemplateLocale,
} from './templates'

export function TemplateSettings({
  value,
  onChange,
  event,
  locale,
  onEventChange,
  onLocaleChange,
  issue,
}: {
  value: EmailTemplates
  onChange: (value: EmailTemplates) => void
  event: TemplateEvent
  locale: TemplateLocale
  onEventChange: (value: TemplateEvent) => void
  onLocaleChange: (value: TemplateLocale) => void
  issue?: TemplateIssue
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`mailSettings.${key}`)
  const current = value[event][locale]
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [preview, setPreview] = useState<EmailTemplate>({
    subject: '',
    html: '',
  })
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const restoreRef = useRef<HTMLButtonElement>(null)
  const fieldError = (field: keyof EmailTemplate) =>
    issue?.event === event && issue.locale === locale && issue.field === field
      ? tr(issue.message)
      : undefined
  const patch = (template: EmailTemplate) =>
    onChange({
      ...value,
      [event]: { ...value[event], [locale]: template },
    })
  function insertVariable(variable: string) {
    const input = bodyRef.current
    const start = input?.selectionStart ?? current.html.length
    const end = input?.selectionEnd ?? start
    const token = `{{${variable}}}`
    const html = current.html.slice(0, start) + token + current.html.slice(end)
    if (html.length > 30000) return
    patch({ ...current, html })
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <>
      <ConfigurationSection
        title={tr('templates')}
        action={
          <div className='flex flex-wrap gap-2'>
            <Button
              ref={restoreRef}
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setRestoreOpen(true)}
            >
              <RotateCcw aria-hidden='true' className='size-4' />
              {tr('templateRestore')}
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setPreview(previewTemplate(current))}
                >
                  <Eye aria-hidden='true' className='size-4' />
                  {tr('templatePreview')}
                </Button>
              </DialogTrigger>
              <DialogContent
                className='max-h-[90dvh] overflow-y-auto sm:max-w-2xl'
                aria-describedby={undefined}
              >
                <DialogHeader>
                  <DialogTitle>{tr('templatePreviewTitle')}</DialogTitle>
                </DialogHeader>
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <p className='min-w-0 flex-1 text-sm font-medium break-words'>
                    {preview.subject}
                  </p>
                  <Badge variant='secondary'>{tr('templateSample')}</Badge>
                </div>
                <iframe
                  title={tr('templatePreviewTitle')}
                  tabIndex={-1}
                  sandbox=''
                  referrerPolicy='no-referrer'
                  srcDoc={preview.html}
                  className='h-[min(65dvh,560px)] w-full rounded-md border bg-background'
                />
              </DialogContent>
            </Dialog>
          </div>
        }
      >
        <div className='grid min-w-0 gap-4 @lg/settings:grid-cols-2'>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='mail-template-event'>{tr('templateType')}</Label>
            <Select
              value={event}
              onValueChange={(next) => onEventChange(next as TemplateEvent)}
            >
              <SelectTrigger id='mail-template-event' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateEvents.map((item) => (
                  <SelectItem key={item} value={item}>
                    {tr(`templateEvents.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='mail-template-locale'>
              {tr('templateLanguage')}
            </Label>
            <Select
              value={locale}
              onValueChange={(next) => onLocaleChange(next as TemplateLocale)}
            >
              <SelectTrigger id='mail-template-locale' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateLocales.map((item) => (
                  <SelectItem key={item} value={item}>
                    {tr(item === 'zh' ? 'templateZh' : 'templateEn')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='mail-template-subject'>{tr('templateSubject')}</Label>
          <Input
            id='mail-template-subject'
            name='templateSubject'
            autoComplete='off'
            maxLength={200}
            value={current.subject}
            onChange={(e) => patch({ ...current, subject: e.target.value })}
            aria-invalid={!!fieldError('subject')}
            aria-describedby={
              fieldError('subject') ? 'mail-template-subject-error' : undefined
            }
          />
          {fieldError('subject') && (
            <p id='mail-template-subject-error' className='sr-only'>
              {fieldError('subject')}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <Label htmlFor='mail-template-html'>{tr('templateHtml')}</Label>
          <Textarea
            ref={bodyRef}
            id='mail-template-html'
            name='templateHtml'
            rows={13}
            maxLength={30000}
            spellCheck={false}
            autoComplete='off'
            className='min-h-64 resize-y font-mono text-xs leading-6'
            value={current.html}
            onChange={(e) => patch({ ...current, html: e.target.value })}
            aria-invalid={!!fieldError('html')}
            aria-describedby={
              fieldError('html') ? 'mail-template-html-error' : undefined
            }
          />
          {fieldError('html') && (
            <p id='mail-template-html-error' className='sr-only'>
              {fieldError('html')}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <span className='text-sm font-medium'>{tr('templateVariables')}</span>
          <div className='flex flex-wrap gap-2'>
            {templateVariables(event).map((variable) => (
              <Button
                type='button'
                key={variable}
                variant='outline'
                size='sm'
                className='h-7 px-2 font-mono text-xs'
                aria-label={t('mailSettings.insertVariable', { variable })}
                onClick={() => insertVariable(variable)}
              >{`{{${variable}}}`}</Button>
            ))}
          </div>
        </div>
      </ConfigurationSection>
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={tr('templateRestoreTitle')}
        desc={<span className='sr-only'>{tr('templateRestoreTitle')}</span>}
        confirmText={tr('templateRestoreAction')}
        cancelBtnText={tr('cancel')}
        handleConfirm={() => {
          patch(defaultTemplate(event, locale))
          setRestoreOpen(false)
          requestAnimationFrame(() => restoreRef.current?.focus())
        }}
      />
    </>
  )
}
