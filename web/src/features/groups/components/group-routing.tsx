import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AccountGroup } from '@/api/account-groups'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'

export type ModelRouteDraft = {
  id: string
  publicModel: string
  upstreamModel: string
}

export function GroupRouting({
  fastMode,
  onFastModeChange,
  live,
  onLiveChange,
  images,
  onImagesChange,
  routes,
  onRoutesChange,
  invalid,
}: {
  fastMode: AccountGroup['fastMode']
  onFastModeChange: (value: AccountGroup['fastMode']) => void
  live: boolean
  onLiveChange: (value: boolean) => void
  images: boolean
  onImagesChange: (value: boolean) => void
  routes: ModelRouteDraft[]
  onRoutesChange: (value: ModelRouteDraft[]) => void
  invalid: string | null
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`channelGroups.${key}`)
  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='group-fast'>{t('groups.fast')}</Label>
        <Select
          value={fastMode}
          onValueChange={(value) => {
            if (
              value === 'default' ||
              value === 'enabled' ||
              value === 'disabled'
            )
              onFastModeChange(value)
          }}
        >
          <SelectTrigger id='group-fast' className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['default', 'enabled', 'disabled'] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {tr(`fast_${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='group-live'>{t('groups.live')}</Label>
        <SwitchLabeled
          id='group-live'
          containedMotion
          checked={live}
          onCheckedChange={onLiveChange}
        />
      </div>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='group-images'>{tr('images')}</Label>
        <SwitchLabeled
          id='group-images'
          containedMotion
          checked={images}
          onCheckedChange={onImagesChange}
        />
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-5'>
        {/* ai-design-check-ignore-next-line use-shared-looks -- Existing group form section heading; this project has no shared Heading component. */}
        <h3 className='text-sm font-semibold'>{t('groups.mapping')}</h3>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='shrink-0'
          disabled={routes.length >= 256}
          onClick={() =>
            onRoutesChange([
              ...routes,
              { id: crypto.randomUUID(), publicModel: '', upstreamModel: '' },
            ])
          }
        >
          <Plus aria-hidden='true' />
          {t('groups.add_mapping')}
        </Button>
      </div>
      {routes.map((route, index) => (
        <fieldset
          key={route.id}
          className='rounded-lg border p-4'
          data-testid='model-mapping'
        >
          <legend className='sr-only'>
            {t('groups.mapping')} {index + 1}
          </legend>
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              aria-label={t('groups.remove_mapping', { index: index + 1 })}
              onClick={() =>
                onRoutesChange(routes.filter((item) => item.id !== route.id))
              }
            >
              <Trash2 className='size-4' aria-hidden='true' />
            </Button>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            {(['publicModel', 'upstreamModel'] as const).map((key) => (
              <div key={key} className='space-y-2'>
                <Label htmlFor={`${key}-${route.id}`}>
                  {t(
                    key === 'publicModel'
                      ? 'groups.source_model'
                      : 'groups.target_model'
                  )}
                </Label>
                <Input
                  id={`${key}-${route.id}`}
                  name={`${key}-${route.id}`}
                  value={route[key]}
                  maxLength={128}
                  spellCheck={false}
                  aria-invalid={invalid === `${key}-${route.id}` || undefined}
                  aria-describedby={
                    invalid === `${key}-${route.id}`
                      ? 'channel-group-validation'
                      : undefined
                  }
                  onChange={(event) =>
                    onRoutesChange(
                      routes.map((item) =>
                        item.id === route.id
                          ? { ...item, [key]: event.target.value }
                          : item
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
