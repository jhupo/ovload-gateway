import { useEffect, useState } from 'react'
import { LogIn, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RestoreAccepted } from '@/api/backups'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { clearDatabaseRestore } from './restore-state'

export function DatabaseRestoreProgress({ job }: { job: RestoreAccepted }) {
  const { t } = useTranslation()
  const [state, setState] = useState('restoring')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      let terminal = false
      try {
        const response = await fetch(
          `/api/backup-restore/status?id=${encodeURIComponent(job.id)}`,
          {
            headers: { 'X-Restore-Ticket': job.ticket },
            credentials: 'omit',
            cache: 'no-store',
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10_000),
            ]),
          }
        )
        if (response.status === 404) {
          setState('failed')
          setMessage(t('dataBackup.restoreExpired'))
          terminal = true
        } else if (response.ok) {
          const envelope = (await response.json()) as {
            data: { status: string; message: string }
          }
          if (['completed', 'failed'].includes(envelope.data.status)) {
            setState(envelope.data.status)
            setMessage(envelope.data.message)
            terminal = true
            if (envelope.data.status === 'completed')
              useIdentitySession.getState().clear()
          }
        }
      } catch {
        /* The listener is unavailable while the runtime restarts. */
      }
      if (controller.signal.aborted || terminal) return
      if (Date.now() - started > 65 * 60_000) {
        setState('failed')
        setMessage(t('dataBackup.restoreTimedOut'))
        return
      }
      timer = setTimeout(() => void poll(), 2000)
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [job.id, job.ticket, t])
  function close() {
    clearDatabaseRestore()
    window.location.replace(state === 'completed' ? '/sign-in' : '/data-backup')
  }
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <div className='w-full max-w-lg space-y-5 text-center'>
        <h1 className='text-xl font-semibold'>
          {t(
            `dataBackup.${state === 'completed' ? 'restoreCompleted' : state === 'failed' ? 'restoreFailed' : 'restoring'}`
          )}
        </h1>
        {message && (
          <p
            role={state === 'failed' ? 'alert' : 'status'}
            className='text-sm break-words text-muted-foreground'
          >
            {message}
          </p>
        )}
        {state !== 'restoring' && (
          <Button onClick={close}>
            {state === 'completed' ? <LogIn /> : <RotateCcw />}
            {t(
              state === 'completed'
                ? 'dataBackup.restoreLogin'
                : 'dataBackup.restoreReturn'
            )}
          </Button>
        )}
      </div>
    </main>
  )
}
