import { useRef, useState, type RefObject } from 'react'
import {
  Check,
  ChevronsUpDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSettingsUsers } from '@/hooks/use-settings-options'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { UserIdentity } from '@/features/users/components/user-identity'
import {
  overrideErrors,
  type ReferralDraft,
  type ReferralOverride,
} from './referral-draft'

export function ReferralSettings({
  value,
  onChange,
  errors,
  formRef,
  onSave,
}: {
  value: ReferralDraft
  onChange: (value: ReferralDraft) => void
  errors: Record<string, string>
  formRef: RefObject<HTMLFormElement | null>
  onSave: () => void
}) {
  const { t } = useTranslation()
  const users = useSettingsUsers()
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<ReferralOverride | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const rows = value.overrides.filter((item) => {
    const user = users.find((user) => user.id === item.userId)
    return `${user?.email} ${user?.username}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  })
  return (
    <div className='@container/referral w-full space-y-6'>
      <SettingsControlCard title={t('referralSettings.enabled')} compact>
        <SwitchLabeled
          size='sm'
          containedMotion
          aria-label={t('referralSettings.enabled')}
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </SettingsControlCard>
      <ConfigurationSection title={t('referralSettings.rules')}>
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <div className='grid grid-cols-1 gap-5 @lg/referral:grid-cols-2'>
            {(
              [
                {
                  key: 'rate',
                  unit: '%',
                  min: 0,
                  max: 100,
                  step: '0.01',
                  hint: '',
                },
                {
                  key: 'freezeHours',
                  unit: t('referralSettings.hours'),
                  min: 0,
                  max: 876000,
                  step: '1',
                  hint: 'noFreeze',
                },
                {
                  key: 'eligibilityDays',
                  unit: t('referralSettings.days'),
                  min: 0,
                  max: 36500,
                  step: '1',
                  hint: 'forever',
                },
                {
                  key: 'cap',
                  unit: '$',
                  min: 0,
                  max: 999999999.99,
                  step: '0.01',
                  hint: 'unlimited',
                },
              ] as const
            ).map(({ key, unit, min, max, step, hint }) => (
              <div className='min-w-0 space-y-2' key={key}>
                <Label
                  htmlFor={'referral-' + key}
                  className='flex min-h-5 flex-wrap items-center justify-between gap-2 leading-5'
                >
                  {t('referralSettings.' + key)}
                  {hint && (
                    <span className='text-xs font-normal text-muted-foreground'>
                      {t('referralSettings.' + hint)}
                    </span>
                  )}
                </Label>
                <div className='relative'>
                  <Input
                    id={'referral-' + key}
                    name={key}
                    type='number'
                    autoComplete='off'
                    inputMode={step === '1' ? 'numeric' : 'decimal'}
                    min={min}
                    max={max}
                    step={step}
                    value={value[key]}
                    onChange={(event) =>
                      onChange({ ...value, [key]: event.target.value })
                    }
                    aria-invalid={!!errors[key]}
                    aria-describedby={
                      errors[key] ? 'referral-' + key + '-error' : undefined
                    }
                    className='scroll-mb-24 [appearance:textfield] pe-12 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                  />
                  <span
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground'
                  >
                    {unit}
                  </span>
                </div>
                {errors[key] && (
                  <p id={'referral-' + key + '-error'} className='sr-only'>
                    {t('referralSettings.' + errors[key])}
                  </p>
                )}
              </div>
            ))}
          </div>
        </form>
      </ConfigurationSection>
      <ConfigurationSection
        title={t('referralSettings.overrides')}
        action={
          <Button
            ref={addRef}
            size='sm'
            variant='outline'
            disabled={value.overrides.length === users.length}
            onClick={(event) => {
              actionRef.current = event.currentTarget
              setEditor({ userId: '', invitationCode: '', rate: '' })
            }}
          >
            <Plus aria-hidden='true' className='size-4' />
            {t('referralSettings.addUser')}
          </Button>
        }
      >
        <div className='relative max-w-sm'>
          <Search
            aria-hidden='true'
            className='pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground'
          />
          <Input
            name='referral-search'
            autoComplete='off'
            aria-label={t('referralSettings.search')}
            placeholder={t('referralSettings.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='h-8 ps-9'
          />
        </div>
        <div className='overflow-hidden rounded-lg border'>
          <Table className='table-fixed'>
            <TableHeader>
              <TableRow className='bg-muted/40'>
                <TableHead className='ps-4 @lg/referral:w-[46%]'>
                  {t('referralSettings.user')}
                </TableHead>
                <TableHead className='hidden w-[22%] @lg/referral:table-cell'>
                  {t('referralSettings.invitationCode')}
                </TableHead>
                <TableHead className='hidden @lg/referral:table-cell'>
                  {t('referralSettings.dedicatedRate')}
                </TableHead>
                <TableHead className='w-20 pe-4'>
                  <span className='sr-only'>
                    {t('referralSettings.actions')}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className='h-28 text-center whitespace-normal text-muted-foreground'
                  >
                    {t(
                      search
                        ? 'referralSettings.noResults'
                        : 'referralSettings.empty'
                    )}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((item) => {
                const user = users.find((user) => user.id === item.userId)
                const rate =
                  item.rate === ''
                    ? t('referralSettings.globalRate')
                    : item.rate + '%'
                return (
                  <TableRow key={item.userId}>
                    <TableCell className='min-w-0 py-3 ps-4'>
                      {user ? (
                        <UserIdentity user={user} />
                      ) : (
                        <span className='break-all'>{item.userId}</span>
                      )}
                      <div className='mt-2 truncate text-xs text-muted-foreground @lg/referral:hidden'>
                        {item.invitationCode ||
                          t('referralSettings.defaultCode')}{' '}
                        · {rate}
                      </div>
                    </TableCell>
                    <TableCell
                      className='hidden truncate font-mono text-xs @lg/referral:table-cell'
                      title={item.invitationCode}
                    >
                      {item.invitationCode || t('referralSettings.defaultCode')}
                    </TableCell>
                    <TableCell className='hidden tabular-nums @lg/referral:table-cell'>
                      {rate}
                    </TableCell>
                    <TableCell className='pe-3'>
                      <div className='flex justify-end'>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size='icon'
                              variant='ghost'
                              className='size-8'
                              aria-label={t('referralSettings.editUser', {
                                name: user?.username ?? item.userId,
                              })}
                              onClick={(event) => {
                                actionRef.current = event.currentTarget
                                setEditor(item)
                              }}
                            >
                              <Pencil aria-hidden='true' className='size-4' />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common.edit')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size='icon'
                              variant='ghost'
                              className='size-8 text-destructive'
                              aria-label={t('referralSettings.removeUser', {
                                name: user?.username ?? item.userId,
                              })}
                              onClick={() => setRemoving(item.userId)}
                            >
                              <Trash2 aria-hidden='true' className='size-4' />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common.delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </ConfigurationSection>
      {editor && (
        <OverrideEditor
          initial={editor}
          entries={value.overrides}
          onClose={() => setEditor(null)}
          restoreFocus={() => actionRef.current?.focus()}
          onApply={(entry) => {
            onChange({
              ...value,
              overrides: editor.userId
                ? value.overrides.map((item) =>
                    item.userId === editor.userId ? entry : item
                  )
                : [...value.overrides, entry],
            })
            setEditor(null)
          }}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={t('referralSettings.removeTitle')}
        desc={
          <span className='sr-only'>{t('referralSettings.removeTitle')}</span>
        }
        confirmText={t('common.delete')}
        handleConfirm={() => {
          onChange({
            ...value,
            overrides: value.overrides.filter(
              (item) => item.userId !== removing
            ),
          })
          setRemoving(null)
          requestAnimationFrame(() => addRef.current?.focus())
        }}
      />
    </div>
  )
}

function OverrideEditor({
  initial,
  entries,
  onClose,
  onApply,
  restoreFocus,
}: {
  initial: ReferralOverride
  entries: ReferralOverride[]
  onClose: () => void
  onApply: (entry: ReferralOverride) => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const users = useSettingsUsers()
  const [value, setValue] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(value) !== JSON.stringify(initial)
  const selected = users.find((user) => user.id === value.userId)
  const title = t(
    initial.userId ? 'referralSettings.editTitle' : 'referralSettings.addUser'
  )
  function change(key: keyof ReferralOverride, input: string) {
    setValue({ ...value, [key]: input })
    setErrors({})
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-md'
        onInteractOutside={(event) => {
          if (dirty) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (dirty) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className='sr-only'>{title}</DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          noValidate
          className='space-y-5'
          onSubmit={(event) => {
            event.preventDefault()
            const next = overrideErrors(
              value,
              entries.filter((item) => item.userId !== initial.userId)
            )
            setErrors(next)
            if (Object.keys(next).length) {
              toast.error(t('referralSettings.' + Object.values(next)[0]), {
                id: 'referral-override-validation',
              })
              requestAnimationFrame(() =>
                formRef.current
                  ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus()
              )
              return
            }
            onApply({
              ...value,
              invitationCode: value.invitationCode.trim(),
              rate: value.rate.trim() ? String(Number(value.rate)) : '',
            })
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='referral-user'>{t('referralSettings.user')}</Label>
            <Popover modal open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id='referral-user'
                  type='button'
                  variant='outline'
                  role='combobox'
                  aria-expanded={pickerOpen}
                  aria-invalid={!!errors.userId}
                  aria-describedby={
                    errors.userId ? 'referral-user-error' : undefined
                  }
                  disabled={!!initial.userId}
                  className='h-11 w-full min-w-0 justify-between dark:aria-invalid:border-destructive'
                >
                  <span className='truncate'>
                    {selected?.username ?? t('referralSettings.selectUser')}
                  </span>
                  <ChevronsUpDown
                    aria-hidden='true'
                    className='size-4 shrink-0 opacity-50'
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align='start'
                className='w-[var(--radix-popover-trigger-width)] p-0'
              >
                <Command>
                  <CommandInput
                    aria-label={t('referralSettings.search')}
                    placeholder={t('referralSettings.search')}
                  />
                  <CommandList className='max-h-[min(13rem,calc(var(--radix-popover-content-available-height)-3rem))] overscroll-contain'>
                    <CommandEmpty>
                      {t('referralSettings.noResults')}
                    </CommandEmpty>
                    <CommandGroup>
                      {users
                        .filter(
                          (user) =>
                            !entries.some((item) => item.userId === user.id)
                        )
                        .map((user) => (
                          <CommandItem
                            key={user.id}
                            value={`${user.id} ${user.username} ${user.email}`}
                            onSelect={() => {
                              change('userId', user.id)
                              setPickerOpen(false)
                            }}
                          >
                            <div className='min-w-0 flex-1'>
                              <UserIdentity user={user} />
                            </div>
                            {value.userId === user.id && (
                              <Check aria-hidden='true' className='size-4' />
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.userId && (
              <p id='referral-user-error' className='sr-only'>
                {t('referralSettings.' + errors.userId)}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='referral-code'>
              {t('referralSettings.invitationCode')}
            </Label>
            <Input
              id='referral-code'
              name='invitationCode'
              autoComplete='off'
              spellCheck={false}
              maxLength={32}
              placeholder={t('referralSettings.defaultCode')}
              value={value.invitationCode}
              aria-invalid={!!errors.invitationCode}
              aria-describedby={
                errors.invitationCode ? 'referral-code-error' : undefined
              }
              onChange={(event) => change('invitationCode', event.target.value)}
            />
            {errors.invitationCode && (
              <p id='referral-code-error' className='sr-only'>
                {t('referralSettings.' + errors.invitationCode)}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='referral-override-rate'>
              {t('referralSettings.dedicatedRate')} (%)
            </Label>
            <Input
              id='referral-override-rate'
              name='dedicatedRate'
              type='number'
              inputMode='decimal'
              autoComplete='off'
              min={0}
              max={100}
              step='0.01'
              placeholder={t('referralSettings.globalRate')}
              value={value.rate}
              aria-invalid={!!errors.rate}
              aria-describedby={
                errors.rate ? 'referral-override-rate-error' : undefined
              }
              onChange={(event) => change('rate', event.target.value)}
            />
            {errors.rate && (
              <p id='referral-override-rate-error' className='sr-only'>
                {t('referralSettings.' + errors.rate)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type='submit'>{t('referralSettings.apply')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
