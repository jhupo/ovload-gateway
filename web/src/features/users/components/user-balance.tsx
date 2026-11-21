import { useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { allows } from '@/stores/identity-session'
import { formatUsd } from '@/lib/usd'
import { useUserWallet, useUserWalletCredits } from '@/hooks/use-user-wallet'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RequestErrorToast } from '@/components/request-error-toast'
import { type User } from '../data/schema'
import { UserRechargeDialog } from './user-recharge-dialog'

export function UserBalance({ user }: { user: User }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        ref={trigger}
        variant='ghost'
        size='sm'
        className='h-9 gap-1.5 px-2 font-semibold tabular-nums shadow-none'
        aria-label={t('users.balance_for', { name: user.username })}
        disabled={!allows('billing.read', user.tenantId)}
        onClick={() => setOpen(true)}
      >
        <span
          className='max-w-40 truncate'
          title={formatUsd(user.balanceUsd, i18n.language)}
        >
          {formatUsd(user.balanceUsd, i18n.language)}
        </span>
        <ArrowUpRight
          className='size-3 text-muted-foreground'
          aria-hidden='true'
        />
      </Button>
      {open && (
        <UserBalanceDialog
          user={user}
          onClose={() => setOpen(false)}
          restoreFocus={() => trigger.current?.focus()}
        />
      )}
    </>
  )
}

export function UserBalanceDialog({
  user,
  onClose,
  restoreFocus,
}: {
  user: User
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t, i18n } = useTranslation()
  const [kind, setKind] = useState('all')
  const [recharge, setRecharge] = useState(false)
  const rechargeTrigger = useRef<HTMLButtonElement>(null)
  const wallet = useUserWallet(user.tenantId)
  const history = useUserWalletCredits(user.tenantId)
  const entries = history.data?.pages.flatMap((page) => page.items) ?? []
  const total = history.data?.pages[0]?.total_credited_usd
  const dateTime = new Intl.DateTimeFormat(i18n.language, {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[34rem]'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader className='shrink-0 border-b px-5 py-4 text-start sm:px-6'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0 space-y-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <DialogTitle className='text-base'>
                  {t('users.balance_history')}
                </DialogTitle>
              </div>
              <p className='truncate text-xs text-muted-foreground'>
                ID {user.id} · {user.email}
              </p>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='-me-2 -mt-1 size-8 shrink-0 text-muted-foreground shadow-none'
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <X className='size-4' aria-hidden='true' />
            </Button>
          </div>
          <DialogDescription className='sr-only'>
            {t('users.balance_for', { name: user.username })}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6'>
          <div className='flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4'>
            <dl className='min-w-0'>
              <dt className='text-xs text-muted-foreground'>
                {t('users.available_balance')}
              </dt>
              <dd className='mt-1.5 text-2xl font-semibold break-all tabular-nums'>
                {formatUsd(wallet.data?.available_usd, i18n.language)}
              </dd>
            </dl>
            <Button
              ref={rechargeTrigger}
              size='sm'
              className='shrink-0'
              disabled={!allows('billing.manage', user.tenantId)}
              onClick={() => setRecharge(true)}
            >
              <Plus className='size-4' aria-hidden='true' />
              {t('users.recharge')}
            </Button>
          </div>
          <div className='mt-5 flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-xs font-medium'>{t('users.credit_history')}</h3>
            <p className='text-xs text-muted-foreground'>
              {t('users.total_credited')}{' '}
              <span className='tabular-nums'>
                {formatUsd(total, i18n.language)}
              </span>
            </p>
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger
              className='mt-3 h-8 w-40 text-xs'
              aria-label={t('users.credit_type')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['all', 'admin', 'redemption', 'refund'] as const).map(
                (value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={value === 'redemption' || value === 'refund'}
                    title={
                      value === 'redemption' || value === 'refund'
                        ? t('users.unavailable')
                        : undefined
                    }
                  >
                    {t('users.credit_types.' + value)}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <ul className='mt-1 divide-y' aria-label={t('users.credit_history')}>
            {entries.length ? (
              entries.map((entry) => {
                const EntryIcon = ArrowDownLeft
                return (
                  <li
                    key={entry.ledger_entry_id}
                    className='flex items-center gap-3 py-3.5'
                  >
                    <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground'>
                      <EntryIcon className='size-4' aria-hidden='true' />
                    </span>
                    <div className='min-w-0 flex-1'>
                      <p className='text-[13px] font-medium'>
                        {t('users.credit_types.' + entry.kind)}
                      </p>
                      <time
                        dateTime={entry.created_at}
                        className='mt-1.5 block text-[11px] text-muted-foreground tabular-nums'
                      >
                        {dateTime.format(new Date(entry.created_at))} UTC
                      </time>
                      <p className='mt-1 truncate text-[11px] text-muted-foreground'>
                        {entry.reason}
                      </p>
                    </div>
                    <p className='max-w-[45%] text-end text-sm font-medium break-all text-[var(--telemetry-2)] tabular-nums'>
                      +{formatUsd(entry.amount_usd, i18n.language)}
                    </p>
                  </li>
                )
              })
            ) : (
              <li className='py-12 text-center text-sm text-muted-foreground'>
                {!history.canRead ? (
                  t('identity.permissionRequired')
                ) : history.isPending ? (
                  t('identity.loading')
                ) : history.error ? (
                  <RequestErrorToast
                    message={history.error.message}
                    retry={() => void history.refetch()}
                  />
                ) : (
                  t('users.no_credits')
                )}
              </li>
            )}
          </ul>
          {wallet.error && (
            <RequestErrorToast
              message={wallet.error.message}
              retry={() => void wallet.refetch()}
            />
          )}
          {history.error && entries.length > 0 && (
            <RequestErrorToast
              message={history.error.message}
              retry={() => void history.refetch()}
            />
          )}
          {history.hasNextPage && (
            <Button
              variant='outline'
              size='sm'
              className='mt-3 w-full'
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {t('identity.loadMore')}
            </Button>
          )}
        </div>
        {recharge && (
          <UserRechargeDialog
            user={user}
            onClose={() => setRecharge(false)}
            restoreFocus={() => rechargeTrigger.current?.focus()}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
