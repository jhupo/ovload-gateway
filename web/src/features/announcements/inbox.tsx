import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIdentitySession } from '@/stores/identity-session'
import { useEngagement } from '@/hooks/use-engagement'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { AnnouncementContent } from './content'
import type { Announcement } from './data'

export function AnnouncementInbox() {
  const customer = useIdentitySession((s) => s.session?.audience === 'customer')
  if (!customer) return null
  return <CustomerInbox />
}

function CustomerInbox() {
  const { t } = useTranslation()
  const {
    data = [],
    execute,
    busy,
  } = useEngagement<Announcement[]>('announcements')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const unread = data.filter((a) => !a.read)
  const popup = unread.find(
    (a) =>
      a.delivery === 'popup' && !dismissed.includes(`${a.id}:${a.revision}`)
  )
  const item =
    data.find((a) => a.id === selected) ?? (!open ? popup : undefined)
  const close = () => {
    if (item) setDismissed((ids) => [...ids, `${item.id}:${item.revision}`])
    setSelected(null)
    setOpen(false)
  }
  return (
    <>
      <Button
        variant='ghost'
        size='icon'
        className='relative rounded-full'
        aria-label={t('announcements.title')}
        onClick={() => setOpen(true)}
      >
        <Bell className='size-4' />
        {unread.length > 0 && (
          <span className='absolute top-1 right-1 size-2 rounded-full bg-primary' />
        )}
      </Button>
      <Dialog
        open={open || !!item}
        onOpenChange={(value) => {
          if (!value) close()
        }}
      >
        <DialogContent className='flex max-h-[85dvh] flex-col sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{item?.title ?? t('announcements.title')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {t('announcements.title')}
            </DialogDescription>
          </DialogHeader>
          <div className='min-h-0 overflow-y-auto'>
            {item ? (
              <AnnouncementContent content={item.content} />
            ) : (
              <div className='divide-y'>
                {data.map((a) => (
                  <button
                    key={a.id}
                    className='flex w-full items-center gap-3 py-3 text-left text-sm'
                    onClick={() => setSelected(a.id)}
                  >
                    {!a.read && (
                      <span className='size-2 shrink-0 rounded-full bg-primary' />
                    )}
                    <span className='min-w-0 flex-1 truncate'>{a.title}</span>
                  </button>
                ))}
                {!data.length && (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    {t('common.no_data')}
                  </p>
                )}
              </div>
            )}
          </div>
          {item && (
            <Button
              className='self-end'
              disabled={busy}
              onClick={() => {
                if (item.read) {
                  close()
                  return
                }
                void execute({
                  op: 'read_announcement',
                  id: item.id,
                  revision: item.revision,
                })
                  .then(close)
                  .catch(() => {})
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
