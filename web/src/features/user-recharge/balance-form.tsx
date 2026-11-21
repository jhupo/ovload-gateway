import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { payments, type PaymentOrder, type PaymentQuote } from '@/api/payments'
import { useIdentitySession } from '@/stores/identity-session'
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
import { RequestErrorToast } from '@/components/request-error-toast'
import { BalanceCheckout } from './balance-checkout'
import { PaymentMethods } from './payment-methods'

export function BalanceForm({ balanceUsd }: { balanceUsd?: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`userRecharge.${key}`)
  const owner = useIdentitySession((s) => s.session?.id)
  const client = useQueryClient()
  const [amount, setAmount] = useState('')
  const [quotedAmount, setQuotedAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [active, setActive] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('ovload.payment-order.' + owner)
    } catch {
      return null
    }
  })
  const [show, setShow] = useState(!!active)
  const key = useRef({ amount: '', id: crypto.randomUUID() })
  const config = useQuery({
    queryKey: ['payment-config', owner],
    queryFn: ({ signal }) => payments.config(signal),
  })
  useEffect(() => {
    const timer = setTimeout(() => setQuotedAmount(amount), 300)
    return () => clearTimeout(timer)
  }, [amount])
  const quote = useQuery({
    queryKey: ['payment-quote', owner, quotedAmount],
    queryFn: ({ signal }) =>
      payments.command<PaymentQuote>(
        { action: 'quote', amount: quotedAmount },
        signal
      ),
    enabled:
      !!config.data?.enabled && /^\d{1,9}(\.\d{1,2})?$/.test(quotedAmount),
    retry: false,
  })
  const order = useQuery({
    queryKey: ['payment-order', owner, active],
    queryFn: ({ signal }) =>
      payments.command<PaymentOrder>({ action: 'get', id: active }, signal),
    enabled: !!active,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3000 : false),
    retry: false,
  })
  useEffect(() => {
    if (order.data && order.data.status !== 'pending') {
      key.current = { amount: '', id: crypto.randomUUID() }
    }
    if (order.data?.status === 'paid') {
      void client.invalidateQueries({ queryKey: ['customer-wallet', owner] })
      void client.invalidateQueries({ queryKey: ['payment-orders', owner] })
    }
  }, [order.data, client, owner])
  async function create() {
    if (pending || !quote.data || amount !== quotedAmount) return
    if (key.current.amount !== amount)
      key.current = { amount, id: crypto.randomUUID() }
    setPending(true)
    try {
      const result = await payments.command<PaymentOrder>({
        action: 'create',
        amount,
        idempotencyKey: key.current.id,
        mobile: window.matchMedia('(max-width: 767px)').matches,
      })
      if (useIdentitySession.getState().session?.id !== owner) return
      setActive(result.id)
      try {
        sessionStorage.setItem('ovload.payment-order.' + owner, result.id)
      } catch {
        /* The server retains the order. */
      }
      client.setQueryData(['payment-order', owner, result.id], result)
      setShow(true)
      void client.invalidateQueries({ queryKey: ['payment-orders', owner] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }
  async function cancel() {
    if (!active) return
    setPending(true)
    try {
      const result = await payments.command<PaymentOrder>({
        action: 'cancel',
        id: active,
      })
      client.setQueryData(['payment-order', owner, active], result)
      void client.invalidateQueries({ queryKey: ['payment-orders', owner] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }
  const current = order.data
  const url = current?.checkout?.url
  const validUrl = url?.startsWith('https://') ? url : undefined
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
        className='grid min-w-0 gap-8 @3xl/recharge:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]'
      >
        <div className='min-w-0 space-y-6'>
          <fieldset
            className='min-w-0 space-y-4'
            disabled={!config.data?.enabled || pending}
          >
            <legend className='text-base font-semibold'>
              {tr('chooseAmount')}
            </legend>
            <div className='flex flex-wrap gap-2'>
              {(config.data?.userOffers.length
                ? config.data.userOffers
                : (config.data?.tiers ?? [])
              ).map((tier) => (
                <Button
                  key={tier.amount}
                  type='button'
                  variant={amount === tier.amount ? 'default' : 'outline'}
                  onClick={() => setAmount(tier.amount)}
                >
                  ¥{tier.amount} · +{tier.percent}%
                </Button>
              ))}
            </div>
            <div className='max-w-md space-y-2'>
              <Label htmlFor='recharge-amount'>
                {tr('customAmount')} · CNY
              </Label>
              <Input
                id='recharge-amount'
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode='decimal'
                maxLength={12}
                required
              />
            </div>
          </fieldset>
          {!config.isPending && !config.data?.enabled && (
            <p role='status' className='text-sm text-muted-foreground'>
              {t('integrationSettings.paymentsDisabled')}
            </p>
          )}
          {(config.error || quote.error) && (
            <RequestErrorToast
              message={(config.error ?? quote.error)?.message}
            />
          )}
          <PaymentMethods enabled={!!config.data?.enabled && !pending} />
          {active && (
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setShow(true)
                void order.refetch()
              }}
            >
              {t('integrationSettings.currentOrder')}
            </Button>
          )}
        </div>
        <BalanceCheckout
          balanceUsd={balanceUsd}
          quote={quote.data}
          disabled={
            !config.data?.enabled ||
            !quote.data ||
            quote.isFetching ||
            amount !== quotedAmount ||
            pending
          }
        />
      </form>
      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{tr('balanceRecharge')}</DialogTitle>
            <DialogDescription className='break-all'>
              {current?.id ?? active}
            </DialogDescription>
          </DialogHeader>
          {order.error && <RequestErrorToast message={order.error.message} />}
          {current && (
            <>
              <div className='flex items-center justify-between gap-3'>
                <strong className='text-xl tabular-nums'>
                  ¥{current.totalCny}
                </strong>
                <span>{t('integrationSettings.status.' + current.status)}</span>
              </div>
              {current.status === 'pending' && (
                <>
                  {current.checkout?.mode === 'qrcode' && validUrl && (
                    <div className='mx-auto flex aspect-square w-56 items-center justify-center rounded-md bg-white p-4'>
                      <QRCodeSVG
                        value={validUrl}
                        size={192}
                        title={tr('alipay')}
                      />
                    </div>
                  )}
                  {validUrl && (
                    <Button asChild>
                      <a
                        href={validUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        {tr('pay')}
                      </a>
                    </Button>
                  )}
                  <p className='text-xs text-muted-foreground'>
                    {t('integrationSettings.expiresAt')}{' '}
                    {new Date(current.expiresAt).toLocaleString()}
                  </p>
                </>
              )}
              <DialogFooter>
                {current.status === 'pending' && (
                  <Button
                    type='button'
                    variant='outline'
                    disabled={pending}
                    onClick={() => void cancel()}
                  >
                    {t('integrationSettings.cancelOrder')}
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  disabled={order.isFetching}
                  onClick={() => void order.refetch()}
                >
                  {t('integrationSettings.refreshStatus')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
