import type { ReactNode } from 'react'
import { Globe, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProxyRecord } from '@/api/proxies'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DataTablePaginationControls } from '@/components/data-table/pagination'

export function ProxySearch({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className='relative w-full sm:max-w-80'>
      <Search
        aria-hidden
        className='pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
      />
      {/* ai-design-check-ignore-next-line no-style-overrides -- Leading-icon inset belongs to this reusable search control. */}
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='ps-9'
      />
    </div>
  )
}

export function ProxyPagination({
  page,
  pageSize,
  total,
  busy,
  onPage,
  onSize,
}: {
  page: number
  pageSize: number
  total: number
  busy: boolean
  onPage: (page: number) => void
  onSize: (size: number) => void
}) {
  return (
    <DataTablePaginationControls
      pageIndex={page - 1}
      pageSize={pageSize}
      pageCount={Math.ceil(total / pageSize)}
      onPageChange={(index) => onPage(index + 1)}
      onPageSizeChange={onSize}
      disabled={busy}
      className='shrink-0'
    />
  )
}

export function ProxyDialog({
  title,
  description,
  wide = false,
  compact = false,
  busy,
  onClose,
  restoreFocus,
  children,
}: {
  title: string
  description?: string
  wide?: boolean
  compact?: boolean
  busy: boolean
  onClose: () => void
  restoreFocus?: () => void
  children: ReactNode
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className={`flex max-h-[calc(100dvh-2rem)] flex-col gap-6 ${compact ? 'sm:max-w-lg' : wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl'}`}
        onCloseAutoFocus={
          restoreFocus
            ? (e) => {
                e.preventDefault()
                restoreFocus()
              }
            : undefined
        }
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault()
        }}
      >
        <DialogHeader className='shrink-0 pe-8 text-start'>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function ProxyStatus({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs ${enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
    >
      <span aria-hidden className='size-1.5 rounded-full bg-current' />
      {t(`liveInfrastructure.${enabled ? 'enabled' : 'disabled'}`)}
    </span>
  )
}

export function ProxyLocationCell({ record }: { record: ProxyRecord }) {
  const { t, i18n } = useTranslation()
  const detected = record.detectedLocation?.location
  const manual = !record.autoLocation ? record.location : null
  const location = detected ?? manual
  let country = location?.country
  try {
    if (country)
      country = new Intl.DisplayNames([i18n.language], { type: 'region' }).of(
        country.toLocaleUpperCase('en-US')
      )
  } catch {
    /* Keep upstream country text. */
  }
  return (
    <div className='space-y-1 text-sm'>
      <div className='flex items-center gap-2'>
        <Globe aria-hidden className='size-4 shrink-0 text-muted-foreground' />
        <span>
          {location
            ? [country, location.city].filter(Boolean).join(' · ')
            : t('proxyDesign.locationUnknown')}
        </span>
      </div>
      {manual && (
        <div className='ps-6 text-xs text-muted-foreground'>
          {t('proxyDesign.custom')}: {[manual.country, manual.city].join(' · ')}
        </div>
      )}
    </div>
  )
}

export function ProxyLatency({ record }: { record: ProxyRecord }) {
  const { t, i18n } = useTranslation()
  if (!record.lastTest)
    return (
      <span className='text-muted-foreground'>{t('proxies.untested')}</span>
    )
  return record.lastTest.success ? (
    <span className='text-emerald-700 tabular-nums dark:text-emerald-400'>
      {new Intl.NumberFormat(i18n.language).format(record.lastTest.latencyMs)}{' '}
      ms
    </span>
  ) : (
    <span className='text-destructive'>{t('proxyDesign.failed')}</span>
  )
}

export function ProxyExit({ record }: { record: ProxyRecord }) {
  const ips = [record.lastTest?.exitIpv4, record.lastTest?.exitIpv6].filter(
    Boolean
  )
  if (!ips.length && record.lastTest?.exitIp) ips.push(record.lastTest.exitIp)
  return (
    <div className='space-y-1 font-mono text-xs'>
      {ips.length ? (
        ips.map((ip) => (
          <div key={ip} className='break-all'>
            {ip}
          </div>
        ))
      ) : (
        <span className='text-muted-foreground'>—</span>
      )}
    </div>
  )
}
