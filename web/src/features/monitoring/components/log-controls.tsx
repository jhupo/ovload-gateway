import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { monitoringApi, type LogConfig } from '@/api/monitoring'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { RequestErrorToast } from '@/components/request-error-toast'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'

export function LogControls({
  owner,
  refresh,
}: {
  owner?: string
  refresh: () => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`monitoring.systemLogs.${key}`)
  const [open, setOpen] = useState<'config' | 'cleanup' | null>(null)
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const cache = useQueryClient()
  useIdentitySession((s) => s.grants)
  const canManage = allows('security.settings.manage')
  const config = useQuery({
    queryKey: ['monitoring-log-config', owner],
    queryFn: ({ signal }) => monitoringApi.config(signal),
    enabled: canManage && open === 'config',
    retry: false,
  })
  if (!canManage) return null
  const clean = async () => {
    setBusy(true)
    const before = new Date(Date.now() - days * 86400000).toISOString()
    try {
      let count = 0
      for (;;) {
        const result = await monitoringApi.cleanup(before)
        count += result.deleted
        if (!result.hasMore) break
      }
      toast.success(t('monitoring.systemLogs.cleaned', { count }))
      refresh()
      setOpen(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant='outline'
        aria-label={tr('settings')}
        onClick={() => setOpen('config')}
      >
        <Settings2 />
        {tr('settings')}
      </Button>
      <Button variant='outline' onClick={() => setOpen('cleanup')}>
        <Trash2 />
        {tr('cleanup')}
      </Button>
      <Dialog
        open={open !== null}
        onOpenChange={(v) => {
          if (!v && !busy) setOpen(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tr(open === 'cleanup' ? 'cleanup' : 'settings')}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('title')}
            </DialogDescription>
          </DialogHeader>
          {open === 'config' && config.isError && (
            <RequestErrorToast
              message={config.error.message}
              retry={() => void config.refetch()}
            />
          )}
          {open === 'config' && config.data && (
            <ConfigForm
              key={config.data.revision}
              config={config.data}
              onBusy={setBusy}
              onSaved={() => {
                void cache.invalidateQueries({
                  queryKey: ['monitoring-log-config', owner],
                })
                setOpen(null)
              }}
            />
          )}
          {open === 'cleanup' && (
            <>
              <Label htmlFor='log-clean-days'>{tr('keepDays')}</Label>
              <Input
                id='log-clean-days'
                type='number'
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <p className='text-sm text-muted-foreground'>
                {tr('cleanupConfirm')}
              </p>
              <DialogFooter>
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() => setOpen(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant='destructive'
                  disabled={
                    busy || !Number.isInteger(days) || days < 1 || days > 90
                  }
                  onClick={() => void clean()}
                >
                  {tr('cleanup')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
function ConfigForm({
  config,
  onSaved,
  onBusy,
}: {
  config: LogConfig
  onSaved: () => void
  onBusy: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(config)
  const [saving, setSaving] = useState(false)
  const tr = (key: string) => t(`monitoring.systemLogs.${key}`)
  const save = async () => {
    setSaving(true)
    onBusy(true)
    try {
      await monitoringApi.saveConfig(draft)
      toast.success(t('monitoring.systemLogs.saved'))
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
      onBusy(false)
    }
  }
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <Label htmlFor='log-enabled'>{tr('collect')}</Label>
        <SwitchLabeled
          id='log-enabled'
          checked={draft.enabled}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='log-level'>{tr('level')}</Label>
        <Select
          value={draft.level}
          onValueChange={(level) => setDraft({ ...draft, level })}
        >
          <SelectTrigger id='log-level'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['DEBUG', 'INFO', 'WARN', 'ERROR'].map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='log-retention'>{tr('retentionDays')}</Label>
        <Input
          id='log-retention'
          type='number'
          min={1}
          max={90}
          value={draft.retentionDays}
          onChange={(e) =>
            setDraft({ ...draft, retentionDays: Number(e.target.value) })
          }
        />
      </div>
      <DialogFooter>
        <Button
          disabled={
            saving ||
            !Number.isInteger(draft.retentionDays) ||
            draft.retentionDays < 1 ||
            draft.retentionDays > 90
          }
          onClick={() => void save()}
        >
          {t('common.save')}
        </Button>
      </DialogFooter>
    </div>
  )
}
