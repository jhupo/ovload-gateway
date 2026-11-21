import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RequestErrorToast } from '@/components/request-error-toast'
import { useAuthPolicy } from './use-auth-policy'

export function Consent({
  revision,
  onChange,
  enabled = true,
}: {
  revision: number | null
  onChange: (value: number | null) => void
  enabled?: boolean
}) {
  const { t } = useTranslation()
  const policy = useAuthPolicy()
  const [open, setOpen] = useState(false)
  const agreement = policy.data?.agreement
  if (!enabled) return null
  if (policy.isPending)
    return (
      <div className='h-8' role='status' aria-label={t('identity.loading')} />
    )
  if (policy.isError)
    return (
      <RequestErrorToast
        message={policy.error.message}
        retry={() => void policy.refetch()}
      />
    )
  if (!agreement?.enabled) return null
  return (
    <div className='space-y-2'>
      {agreement.mode === 'checkbox' ? (
        <label className='flex items-center gap-2'>
          <Checkbox
            checked={revision === policy.data.revision}
            onCheckedChange={(checked) =>
              onChange(checked === true ? policy.data.revision : null)
            }
          />
          <span>{t('authConsent.accept')}</span>
        </label>
      ) : (
        <Button type='button' variant='outline' onClick={() => setOpen(true)}>
          {t(
            revision === policy.data.revision
              ? 'authConsent.accepted'
              : 'authConsent.review'
          )}
        </Button>
      )}
      <Button
        type='button'
        variant='link'
        className='h-auto p-0'
        onClick={() => setOpen(true)}
      >
        {t('generalSettings.agreement')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto sm:max-w-2xl'
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{t('generalSettings.agreement')}</DialogTitle>
          </DialogHeader>
          {agreement.updated && <time>{agreement.updated}</time>}
          {agreement.documents.map((doc) => (
            <section key={doc.id} className='space-y-3 break-words'>
              <h3 className='font-semibold'>{doc.title}</h3>
              <ReactMarkdown skipHtml>{doc.content}</ReactMarkdown>
            </section>
          ))}
          <Button
            type='button'
            onClick={() => {
              onChange(policy.data.revision)
              setOpen(false)
            }}
          >
            {t('authConsent.accept')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
