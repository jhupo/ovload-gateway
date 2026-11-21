import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCommerce } from '@/hooks/use-commerce'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateTimePicker } from '@/components/date-time-picker'
import { type CodeType, moneyToCents, positiveInteger } from './data'

export function CodeGenerator({
  onClose,
  restoreFocus,
}: {
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const { plans, execute, busy } = useCommerce('plans')
  const tr = (key: string) => t(`redemption.${key}`)
  const [type, setType] = useState<CodeType>('balance')
  const [amount, setAmount] = useState('50')
  const [count, setCount] = useState('1')
  const [max, setMax] = useState('1')
  const [perUser, setPerUser] = useState('1')
  const [unlimited, setUnlimited] = useState(false)
  const [expires, setExpires] = useState('')
  const [plan, setPlan] = useState(plans[0]?.id ?? '')
  const [notes, setNotes] = useState('')
  const [discard, setDiscard] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const dirty =
    type !== 'balance' ||
    amount !== '50' ||
    count !== '1' ||
    max !== '1' ||
    perUser !== '1' ||
    unlimited ||
    !!expires ||
    !!notes ||
    plan !== plans[0]?.id
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  const close = () => (dirty ? setDiscard(true) : onClose())
  const numeric = (
    id: string,
    value: string,
    change: (v: string) => void,
    limit: number
  ) => (
    <div className='space-y-2'>
      <Label htmlFor={id}>{tr(id)}</Label>
      <Input
        id={id}
        name={id}
        autoComplete='off'
        value={value}
        inputMode='numeric'
        maxLength={7}
        aria-invalid={
          invalid &&
          (!positiveInteger(value, limit) ||
            (id === 'perUser' && !unlimited && Number(value) > Number(max)))
        }
        onChange={(e) => change(e.target.value)}
      />
    </div>
  )
  return (
    <>
      <Dialog open onOpenChange={(v) => !v && close()}>
        <DialogContent
          className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg'
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault()
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='border-b px-5 py-4 text-left'>
            <DialogTitle>{tr('generate')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('preview')}
            </DialogDescription>
          </DialogHeader>
          <form
            id='code-generator'
            className='min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5'
            onSubmit={(e) => {
              e.preventDefault()
              if (busy) return
              const value =
                type === 'balance'
                  ? moneyToCents(amount)
                  : type === 'concurrency'
                    ? Number(amount)
                    : 0
              const valid =
                positiveInteger(count, 100) &&
                (unlimited || positiveInteger(max, 100000)) &&
                positiveInteger(perUser, 100000) &&
                (unlimited || Number(perUser) <= Number(max)) &&
                (type !== 'balance' || value !== null) &&
                (type !== 'concurrency' || positiveInteger(amount, 100000)) &&
                (type !== 'subscription' ||
                  plans.some((p) => p.id === plan && p.published)) &&
                (!expires || Date.parse(expires) > Date.now())
              setInvalid(!valid)
              if (!valid) {
                toast.error(tr('invalid'))
                return
              }
              void execute({
                action: 'generate',
                kind: type,
                value,
                plan_id: type === 'subscription' ? plan : null,
                count: Number(count),
                max_uses: unlimited ? 0 : Number(max),
                per_user: Number(perUser),
                expires_at: expires ? new Date(expires).toISOString() : null,
                notes,
              })
                .then(onClose)
                .catch(() => {})
            }}
          >
            <fieldset disabled={busy} className='contents'>
              {invalid && (
                <p role='alert' className='sr-only'>
                  {tr('invalid')}
                </p>
              )}
              <div className='space-y-2'>
                <Label htmlFor='code-type'>{tr('type')}</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    setType(v as CodeType)
                    setAmount(v === 'concurrency' ? '5' : '50')
                  }}
                >
                  <SelectTrigger id='code-type' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        'balance',
                        'concurrency',
                        'subscription',
                        'invitation',
                      ] as const
                    ).map((v) => (
                      <SelectItem value={v} key={v}>
                        {tr(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(type === 'balance' || type === 'concurrency') && (
                <div className='space-y-2'>
                  <Label htmlFor='amount'>
                    {tr(type === 'balance' ? 'amount' : 'threads')}
                  </Label>
                  <Input
                    id='amount'
                    value={amount}
                    inputMode='decimal'
                    maxLength={10}
                    aria-invalid={
                      invalid &&
                      (type === 'balance'
                        ? moneyToCents(amount) === null
                        : !positiveInteger(amount, 1000))
                    }
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              )}
              {type === 'subscription' && (
                <div className='space-y-2'>
                  <Label htmlFor='plan'>{tr('plan')}</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger id='plan' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plans
                        .filter((p) => p.published)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} · {p.days} {tr('days')}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {numeric('count', count, setCount, 100)}
              <div className='space-y-3 border-t pt-4'>
                <div className='flex items-center justify-between'>
                  <Label htmlFor='max'>{tr('max')}</Label>
                  <label className='flex items-center gap-2 text-xs'>
                    <Checkbox
                      checked={unlimited}
                      onCheckedChange={(v) => setUnlimited(v === true)}
                    />
                    {tr('unlimited')}
                  </label>
                </div>
                <Input
                  id='max'
                  value={unlimited ? '' : max}
                  placeholder={unlimited ? tr('unlimited') : undefined}
                  disabled={unlimited}
                  inputMode='numeric'
                  maxLength={7}
                  onChange={(e) => setMax(e.target.value)}
                  aria-invalid={
                    invalid && !unlimited && !positiveInteger(max, 1000000)
                  }
                />
                {numeric('perUser', perUser, setPerUser, 1000000)}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='expires'>{tr('expires')}</Label>
                <DateTimePicker
                  id='expires'
                  value={expires}
                  label={tr('expires')}
                  onChange={setExpires}
                />
                <span className='text-xs text-muted-foreground'>
                  {!expires && tr('never')}
                </span>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='notes'>{tr('notes')}</Label>
                <Textarea
                  id='notes'
                  value={notes}
                  maxLength={300}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </fieldset>
          </form>
          <DialogFooter className='flex-row justify-end border-t p-4'>
            <Button variant='outline' onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type='submit' form='code-generator' disabled={busy}>
              {tr('generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={tr('discard')}
        desc={<span className='sr-only'>{tr('discard')}</span>}
        confirmText={tr('discard')}
        handleConfirm={onClose}
      />
    </>
  )
}
