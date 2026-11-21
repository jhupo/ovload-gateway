import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GroupPricing } from '@/api/account-groups'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function GroupModelPrices({
  value,
  onChange,
}: {
  value: GroupPricing['modelPrices']
  onChange: (value: GroupPricing['modelPrices']) => void
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() =>
    Object.entries(value).map(([model, rates]) => ({
      id: crypto.randomUUID(),
      model,
      ...rates,
    }))
  )
  const update = (next: typeof rows) => {
    setRows(next)
    onChange(
      Object.fromEntries(
        next.map(({ model, input, output, cacheRead, cacheWrite }) => [
          model,
          { input, output, cacheRead, cacheWrite },
        ])
      )
    )
  }
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        {/* ai-design-check-ignore-next-line use-shared-looks -- Existing group form section heading; this project has no shared Heading component. */}
        <h3 id='group-models-heading' className='text-sm font-semibold'>
          {t('groups.models')}
        </h3>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={rows.length >= 256 || rows.some((r) => !r.model)}
          onClick={() =>
            update([
              ...rows,
              {
                id: crypto.randomUUID(),
                model: '',
                input: '0',
                output: '0',
                cacheRead: '0',
                cacheWrite: '0',
              },
            ])
          }
        >
          <Plus />
          {t('groups.add_price')}
        </Button>
      </div>
      {!rows.length && (
        <p className='text-sm text-muted-foreground'>
          {t('groups.gateway_prices')}
        </p>
      )}
      {rows.map((row, index) => (
        <fieldset
          key={row.id}
          className='space-y-4 rounded-lg border p-4'
          data-testid='model-price'
        >
          <div className='flex items-end gap-2'>
            <div className='min-w-0 flex-1 space-y-2'>
              <Label htmlFor={`group-price-${row.id}`}>
                {t('groups.model')}
              </Label>
              <Input
                id={`group-price-${row.id}`}
                maxLength={128}
                value={row.model}
                aria-invalid={rows.some(
                  (other) => other.id !== row.id && other.model === row.model
                )}
                onChange={(e) => {
                  const model = e.target.value.trim()
                  if (rows.some((r) => r.id !== row.id && r.model === model))
                    return
                  update(
                    rows.map((r) => (r.id === row.id ? { ...r, model } : r))
                  )
                }}
              />
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label={t('groups.remove_price', { index: index + 1 })}
              onClick={() => update(rows.filter((r) => r.id !== row.id))}
            >
              <Trash2 className='size-4' />
            </Button>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            {(
              [
                ['input', 'input_price'],
                ['output', 'output_price'],
                ['cacheRead', 'cache_read_price'],
                ['cacheWrite', 'cache_write_price'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className='space-y-2'>
                <Label htmlFor={`${row.id}-${key}`}>
                  {t(`groups.${label}`)}
                </Label>
                <Input
                  id={`${row.id}-${key}`}
                  type='number'
                  min={0}
                  max={1000000}
                  step='0.0001'
                  value={row[key]}
                  onChange={(e) =>
                    update(
                      rows.map((r) =>
                        r.id === row.id ? { ...r, [key]: e.target.value } : r
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
