import { CreditCard, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function PaymentMethods({ enabled = false }: { enabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <fieldset className='min-w-0 space-y-3' disabled={!enabled}>
      <legend className='text-sm font-medium'>
        {t('userRecharge.method')}
      </legend>
      <RadioGroup
        disabled={!enabled}
        aria-label={t('userRecharge.method')}
        value='alipay'
        className='grid grid-cols-2 gap-3'
      >
        {(['alipay', 'wechat'] as const).map((method) => {
          const Icon = method === 'alipay' ? CreditCard : MessageCircle
          return (
            <Label
              key={method}
              className={`flex min-h-14 min-w-0 items-center gap-2 rounded-md border p-3 ${method === 'wechat' ? 'opacity-50' : ''}`}
            >
              <Icon
                className='size-4 shrink-0 text-muted-foreground'
                aria-hidden='true'
              />
              <span className='min-w-0 flex-1 text-sm break-words'>
                {t(`userRecharge.${method}`)}
              </span>
              <RadioGroupItem
                disabled={method === 'wechat' || !enabled}
                value={method}
                aria-label={t(`userRecharge.${method}`)}
              />
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
