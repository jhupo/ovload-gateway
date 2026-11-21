import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type PaymentDraft, type PaymentErrors } from './draft'
import { PaymentField } from './fields'
import { UserOffers } from './user-offers'

export function RechargeOffers({
  draft,
  errors,
  update,
  onEditorDirtyChange,
}: {
  onEditorDirtyChange: (dirty: boolean) => void
  draft: PaymentDraft
  errors: PaymentErrors
  update: <K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('paymentSettings.' + key)
  const [removing, setRemoving] = useState<string | null>(null)
  const add = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  return (
    <>
      <ConfigurationSection
        title={tr('tiers')}
        action={
          <Button
            ref={add}
            type='button'
            name='tiers'
            size='sm'
            className='h-8'
            disabled={draft.tiers.length >= 20}
            onClick={() =>
              update('tiers', [
                ...draft.tiers,
                { id: crypto.randomUUID(), amount: '', percent: '' },
              ])
            }
          >
            <Plus className='size-4' />
            {tr('addTier')}
          </Button>
        }
      >
        {draft.tiers.length ? (
          draft.tiers.map((tier, index) => (
            <div
              key={tier.id}
              className='grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-end gap-3 rounded-md border p-3 @xl/payment:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem]'
            >
              <div className='col-span-2 min-w-0 @xl/payment:col-span-1'>
                <PaymentField
                  name={'amount-' + tier.id}
                  label={tr('tierAmount') + ' · ' + (index + 1)}
                  value={tier.amount}
                  numeric
                  maxLength={24}
                  error={errors['amount-' + tier.id]}
                  onChange={(value) =>
                    update(
                      'tiers',
                      draft.tiers.map((row) =>
                        row.id === tier.id ? { ...row, amount: value } : row
                      )
                    )
                  }
                />
              </div>
              <PaymentField
                name={'percent-' + tier.id}
                label={tr('bonusPercent')}
                value={tier.percent}
                numeric
                maxLength={24}
                error={errors['percent-' + tier.id]}
                onChange={(value) =>
                  update(
                    'tiers',
                    draft.tiers.map((row) =>
                      row.id === tier.id ? { ...row, percent: value } : row
                    )
                  )
                }
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='mb-0.5 size-8 text-destructive'
                aria-label={tr('deleteTier')}
                onClick={(event) => {
                  opener.current = event.currentTarget
                  setRemoving(tier.id)
                }}
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          ))
        ) : (
          <div className='py-6 text-center text-sm text-muted-foreground'>
            {tr('noTiers')}
          </div>
        )}
      </ConfigurationSection>
      <UserOffers
        rows={draft.userOffers}
        onChange={(rows) => update('userOffers', rows)}
        onEditorDirtyChange={onEditorDirtyChange}
        error={errors.userOffers}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={tr('deleteTier')}
        desc={tr('deleteTierDescription')}
        destructive
        confirmText={tr('delete')}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          ;(opener.current?.isConnected ? opener.current : add.current)?.focus()
        }}
        handleConfirm={() => {
          update(
            'tiers',
            draft.tiers.filter((row) => row.id !== removing)
          )
          opener.current = add.current
          setRemoving(null)
        }}
      />
    </>
  )
}
