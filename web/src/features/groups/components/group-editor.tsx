import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccountGroup, GroupFields } from '@/api/account-groups'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { UpstreamPlatformSelect } from '@/components/upstream-platform-select'
import { retailMultiplierText } from '../data/retail-multiplier'
import { GroupBilling } from './group-billing'
import { GroupModelPrices } from './group-model-prices'
import { GroupRouting, type ModelRouteDraft } from './group-routing'

function hasControl(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

export function GroupEditor({
  record,
  pending,
  onClose,
  onSave,
  restoreFocus,
}: {
  record?: AccountGroup
  pending: boolean
  onClose: () => void
  onSave: (fields: GroupFields) => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`channelGroups.${key}`)
  const [live, setLive] = useState(record?.controls.allowLive ?? true)
  const [rpm, setRpm] = useState(
    String(record?.controls.requestsPerMinute ?? 0)
  )
  const [platform, setPlatform] = useState(record?.platform ?? 'all')
  const [name, setName] = useState(record?.name ?? '')
  const [description, setDescription] = useState(record?.description ?? '')
  const color = record?.color ?? '#0284C7FF'
  const [visibility, setVisibility] = useState<AccountGroup['visibility']>(
    record?.visibility ?? 'private'
  )
  const [fastMode, setFastMode] = useState<AccountGroup['fastMode']>(
    record?.fastMode ?? 'default'
  )
  const [pricing, setPricing] = useState<AccountGroup['pricing']>(
    record?.pricing ?? { peak: null, modelPrices: {} }
  )
  const [images, setImages] = useState(record?.allowImageGeneration ?? true)
  const [multiplier, setMultiplier] = useState(
    retailMultiplierText(record?.retailMultiplierBps ?? 10000)
  )
  const [routes, setRoutes] = useState<ModelRouteDraft[]>(() =>
    Object.entries(record?.modelRoutes ?? {}).map(
      ([publicModel, upstreamModel]) => ({
        id: crypto.randomUUID(),
        publicModel,
        upstreamModel,
      })
    )
  )
  const [discard, setDiscard] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const signature = JSON.stringify([
    platform,
    rpm,
    live,
    name,
    description,
    color,
    visibility,
    fastMode,
    images,
    multiplier,
    routes,
    pricing,
  ])
  const [initial] = useState(signature)
  const dirty = signature !== initial
  const close = () => {
    if (pending) return
    if (dirty) setDiscard(true)
    else onClose()
  }
  const validate = (field: string) => {
    setInvalid(field)
    toast.error(tr('invalid'), { id: 'channel-group-validation' })
    form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (!/^\d{1,7}$/.test(rpm) || Number(rpm) > 1000000) return validate('rpm')
    if (!name.trim() || name.trim().length > 100 || hasControl(name))
      return validate('name')
    if (
      new TextEncoder().encode(description).length > 4096 ||
      hasControl(description)
    )
      return validate('description')
    if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(multiplier))
      return validate('multiplier')
    const [whole, fraction = ''] = multiplier.split('.')
    const bps = Number(whole) * 10000 + Number(fraction.padEnd(4, '0'))
    if (bps > 1000000) return validate('multiplier')
    if (
      pricing.peak &&
      (pricing.peak.startMinute === pricing.peak.endMinute ||
        [
          pricing.peak.peakMultiplierBps,
          pricing.peak.offPeakMultiplierBps,
        ].some(
          (value) =>
            !Number.isInteger(value) ||
            value < 0 ||
            value > 1000000 ||
            value * bps > 10000000000
        ))
    )
      return validate('pricing')
    if (
      Object.entries(pricing.modelPrices).some(
        ([model, rates]) =>
          !model.trim() ||
          /\s/.test(model) ||
          Object.values(rates).some(
            (v) => !/^\d+(\.\d{1,4})?$/.test(v) || Number(v) > 1000000
          )
      )
    )
      return validate('pricing')
    const mappings: Record<string, string> = {}
    if (routes.length > 256) return validate('models')
    for (const route of routes) {
      const publicModel = route.publicModel.trim(),
        upstreamModel = route.upstreamModel.trim()
      if (
        !publicModel ||
        publicModel.length > 128 ||
        hasControl(publicModel) ||
        /\s/.test(publicModel) ||
        Object.hasOwn(mappings, publicModel)
      )
        return validate(`publicModel-${route.id}`)
      if (
        !upstreamModel ||
        upstreamModel.length > 128 ||
        hasControl(upstreamModel) ||
        /\s/.test(upstreamModel)
      )
        return validate(`upstreamModel-${route.id}`)
      Object.defineProperty(mappings, publicModel, {
        value: upstreamModel,
        enumerable: true,
        configurable: true,
      })
    }
    setInvalid(null)
    onSave({
      controls: {
        allowLive: live,
        requestsPerMinute: Number(rpm),
        userOverrides: record?.controls.userOverrides ?? {},
      },
      platform: platform === 'all' ? null : platform,
      name: name.trim(),
      description: description || null,
      color,
      visibility,
      fastMode,
      allowImageGeneration: images,
      retailMultiplierBps: bps,
      modelRoutes: routes.length ? mappings : null,
      pricing,
    })
  }
  const aria = (field: string) => ({
    'aria-invalid': invalid === field || undefined,
    'aria-describedby':
      invalid === field ? 'channel-group-validation' : undefined,
  })
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className='flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-clip p-0 sm:max-w-2xl'
          onEscapeKeyDown={(event) => {
            if (pending || dirty) {
              event.preventDefault()
              close()
            }
          }}
          onInteractOutside={(event) => {
            if (pending || dirty) {
              event.preventDefault()
              close()
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 p-5 text-start'>
            <DialogTitle>
              {t(record ? 'groups.edit' : 'groups.create')}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {record
                ? t('groups.edit_for', { name: record.name })
                : t('groups.create')}
            </DialogDescription>
          </DialogHeader>
          <form
            id='channel-group-form'
            ref={form}
            noValidate
            onSubmit={submit}
            onChange={() => setInvalid(null)}
            className='min-h-0 flex-1 scroll-py-5 space-y-6 overflow-y-auto overscroll-contain px-5 pb-5 [&_input]:scroll-my-4'
            data-testid='group-editor-body'
          >
            <fieldset disabled={pending} className='contents'>
              <section aria-label={t('groups.basic')} className='space-y-5'>
                <div className='space-y-2'>
                  <Label htmlFor='group-name'>{t('groups.name')}</Label>
                  <Input
                    id='group-name'
                    name='name'
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    autoComplete='off'
                    {...aria('name')}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='group-platform'>{t('groups.platform')}</Label>
                  <UpstreamPlatformSelect
                    id='group-platform'
                    className='w-full'
                    value={platform}
                    onValueChange={setPlatform}
                    allLabel={t('groups.all_platforms')}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='group-description'>
                    {t('groups.description')}
                  </Label>
                  <Textarea
                    id='group-description'
                    name='description'
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={4096}
                    {...aria('description')}
                  />
                </div>
                <div className='grid grid-cols-2 items-end gap-4 sm:grid-cols-3'>
                  <div className='space-y-2'>
                    <Label htmlFor='group-rate'>{t('groups.multiplier')}</Label>
                    <Input
                      id='group-rate'
                      name='multiplier'
                      inputMode='decimal'
                      value={multiplier}
                      onChange={(event) => setMultiplier(event.target.value)}
                      {...aria('multiplier')}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='group-rpm'>{t('groups.rpm')}</Label>
                    <Input
                      id='group-rpm'
                      type='number'
                      name='rpm'
                      min={0}
                      max={1000000}
                      value={rpm}
                      onChange={(e) => setRpm(e.target.value)}
                      {...aria('rpm')}
                    />
                  </div>
                  <div className='col-span-2 space-y-2 sm:col-span-1'>
                    <Label htmlFor='group-type'>{t('groups.type')}</Label>
                    <Select
                      value={visibility}
                      onValueChange={(value) => {
                        if (value === 'private' || value === 'public')
                          setVisibility(value)
                      }}
                    >
                      <SelectTrigger id='group-type' className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['private', 'public'] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`groups.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
              <section
                aria-labelledby='group-billing-heading'
                className='space-y-4 border-t pt-5'
              >
                {/* ai-design-check-ignore-next-line use-shared-looks -- Existing group form section heading; this project has no shared Heading component. */}
                <h3
                  id='group-billing-heading'
                  className='text-sm font-semibold'
                >
                  {t('groups.billing')}
                </h3>
                <GroupBilling
                  value={pricing.peak}
                  onChange={(peak) => setPricing({ ...pricing, peak })}
                />
              </section>
              <section
                aria-labelledby='group-models-heading'
                className='space-y-4 border-t pt-5'
              >
                <GroupModelPrices
                  value={pricing.modelPrices}
                  onChange={(modelPrices) =>
                    setPricing({ ...pricing, modelPrices })
                  }
                />
              </section>
              <section
                aria-labelledby='group-routing-heading'
                className='space-y-4 border-t pt-5'
              >
                {/* ai-design-check-ignore-next-line use-shared-looks -- Existing group form section heading; this project has no shared Heading component. */}
                <h3
                  id='group-routing-heading'
                  className='text-sm font-semibold'
                >
                  {t('groups.routing')}
                </h3>
                <GroupRouting
                  fastMode={fastMode}
                  onFastModeChange={setFastMode}
                  live={live}
                  onLiveChange={setLive}
                  images={images}
                  onImagesChange={setImages}
                  routes={routes}
                  onRoutesChange={setRoutes}
                  invalid={invalid}
                />
              </section>
              {invalid && (
                <span id='channel-group-validation' className='sr-only'>
                  {tr('invalid')}
                </span>
              )}
            </fieldset>
          </form>
          <DialogFooter className='shrink-0 border-t p-4'>
            <Button variant='outline' disabled={pending} onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type='submit' form='channel-group-form' disabled={pending}>
              {t(record ? 'groups.save' : 'groups.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={tr('discard')}
        desc={<span className='sr-only'>{tr('discardWarning')}</span>}
        confirmText={tr('discard')}
        handleConfirm={onClose}
      />
    </>
  )
}
