import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export function AddModel({
  provider,
  models,
  onAdd,
}: {
  provider: string
  models: readonly string[]
  onAdd: (model: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const changeOpen = (value: boolean) => {
    setOpen(value)
    setName('')
    setError('')
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          size='sm'
          variant='outline'
          className='h-8 border-dashed text-xs'
          disabled={models.length >= 100}
          aria-label={t('channelConfig.addProviderModel', { provider })}
        >
          <Plus />
          {t('channelConfig.addModel')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-72 max-w-[calc(100vw-2rem)]'
        aria-label={t('channelConfig.addProviderModel', { provider })}
      >
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault()
            const model = name.trim()
            if (!model || model.length > 120 || /\s/.test(model)) {
              setError(t('channelConfig.invalidModel'))
              toast.error(t('channelConfig.invalidModel'), {
                id: 'provider-model-validation',
              })
              return
            }
            if (models.includes(model)) {
              setError(t('channelConfig.duplicateModel'))
              toast.error(t('channelConfig.duplicateModel'), {
                id: 'provider-model-validation',
              })
              return
            }
            onAdd(model)
            changeOpen(false)
          }}
        >
          <Label htmlFor={id}>{t('channelConfig.model')}</Label>
          <Input
            id={id}
            value={name}
            maxLength={120}
            autoComplete='off'
            aria-invalid={Boolean(error)}
            aria-describedby={error ? id + '-error' : undefined}
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
          />
          {error && (
            <p id={id + '-error'} role='alert' className='sr-only'>
              {error}
            </p>
          )}
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => changeOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type='submit' size='sm'>
              {t('channelConfig.addModel')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
