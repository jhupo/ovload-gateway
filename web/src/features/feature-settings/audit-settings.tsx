import {
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type ChangeEvent,
} from 'react'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { integrations } from '@/api/integrations'
import { proxies } from '@/api/proxies'
import { useIdentitySession } from '@/stores/identity-session'
import {
  accountProviderLabel,
  aggregatePlatformCounts,
} from '@/lib/upstream-platforms'
import { useSettingsGroups } from '@/hooks/use-settings-options'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import {
  endpointSchema,
  keywordRulesSchema,
  retentionRulesSchema,
  executionRulesSchema,
  responseRulesSchema,
  auditRuleSchema,
  deliveryRulesSchema,
  newAuditRule,
  auditErrorKey,
  type AuditDraft,
  type AuditRule,
  type AuditNode,
  type AuditErrors,
} from './audit-draft'
import { SettingsSelectionTable } from './settings-selection-table'

function Field({
  path,
  label,
  value,
  onChange,
  errors,
  min,
  max,
  step,
  placeholder,
  multiline = false,
  disabled = false,
  maxLength,
}: {
  path: string
  label: string
  value: string
  onChange?: (value: string) => void
  errors?: AuditErrors
  min?: number
  max?: number
  step?: string
  placeholder?: string
  multiline?: boolean
  maxLength?: number
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const error = errors?.[path]
  const props = {
    id,
    value,
    disabled,
    placeholder,
    name: path,
    'data-audit-field': path,
    'aria-invalid': !!error,
    'aria-describedby': error ? id + '-error' : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange?.(event.target.value),
  }
  return (
    <div className={multiline ? 'min-w-0 space-y-2' : 'min-w-0 space-y-2'}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          {...props}
          maxLength={maxLength ?? 20000}
          className='min-h-24 resize-y'
        />
      ) : (
        <Input
          {...props}
          type={min !== undefined ? 'number' : 'text'}
          inputMode={min !== undefined ? 'decimal' : undefined}
          min={min}
          max={max}
          step={step ?? '1'}
          maxLength={
            maxLength ??
            (path.endsWith('blockMessage')
              ? 1000
              : path.endsWith('model')
                ? 160
                : path === 'name'
                  ? 80
                  : 2048)
          }
          spellCheck={false}
          autoComplete='off'
        />
      )}
      {error && (
        <span id={id + '-error'} className='sr-only'>
          {t('auditSettings.' + error)}
        </span>
      )}
    </div>
  )
}
function Choice({
  path,
  label,
  value,
  options,
  onChange,
  errors,
}: {
  path: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  errors?: AuditErrors
}) {
  const id = useId()
  const { t } = useTranslation()
  const error = errors?.[path]
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className='w-full'
          data-audit-field={path}
          aria-invalid={!!error}
          aria-describedby={error ? id + '-error' : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span id={id + '-error'} className='sr-only'>
          {t('auditSettings.' + error)}
        </span>
      )}
    </div>
  )
}
function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingsControlCard title={label} compact>
      <SwitchLabeled
        size='sm'
        containedMotion
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </SettingsControlCard>
  )
}
function AuditGroups({
  value,
  onChange,
  errors,
}: {
  value: string[]
  onChange: (groupIds: string[]) => void
  errors: AuditErrors
}) {
  const { t, i18n } = useTranslation()
  const groups = useSettingsGroups()
  const number = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 4,
  })
  return (
    <SettingsSelectionTable
      title={t('auditSettings.scope')}
      addLabel={t('auditSettings.addGroup')}
      selectLabel={t('auditSettings.selectGroup')}
      detailLabel={t('groups.platform')}
      rateLabel={t('groups.rate')}
      options={groups.map((group) => ({
        id: group.id,
        name: group.name,
        detail: Object.keys(aggregatePlatformCounts(group.providerCounts))
          .map((provider) => accountProviderLabel(provider))
          .join(', '),
        status: t('groups.' + (group.enabled ? 'active' : 'disabled')),
        visibility: t('groups.' + group.visibility),
        accountCount: group.memberCount,
        rate: number.format(group.retailMultiplierBps / 10000) + '×',
      }))}
      selected={value}
      onChange={onChange}
      testId='audit-scope'
      filterDetail
      fieldName='shared.groupIds'
      error={
        errors['shared.groupIds']
          ? t('auditSettings.' + errors['shared.groupIds'])
          : undefined
      }
    />
  )
}
function IconAction({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
function EndpointPool({
  value,
  onChange,
  errors,
  credentials,
}: {
  value: AuditNode[]
  onChange: (value: AuditNode[]) => void
  errors: AuditErrors
  credentials: AuditCredentials
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('auditSettings.' + key)
  const [editor, setEditor] = useState<AuditNode | null>(null)
  const [initial, setInitial] = useState<AuditNode | null>(null)
  const [editorErrors, setEditorErrors] = useState<AuditErrors>({})
  const [removing, setRemoving] = useState<AuditNode | null>(null)
  const owner = useIdentitySession((s) => s.session?.id)
  const proxyOptions = useQuery({
    queryKey: ['audit-proxy-options', owner],
    queryFn: async ({ signal }) => {
      const items = []
      let page = 1
      let pages: number
      do {
        const r = await proxies.list(
          new URLSearchParams({ page: String(page), pageSize: '200' }),
          signal
        )
        items.push(...r.items)
        pages = r.page.totalPages
        page++
      } while (page <= pages)
      return items
    },
    enabled: !!owner,
  })
  const [apiKey, setApiKey] = useState<string | null>('')
  const initialApiKey = useRef<string | null>('')
  const [probes, setProbes] = useState<Record<string, string>>({})
  const [probing, setProbing] = useState<string | null>(null)
  async function probe(id: string) {
    setProbing(id)
    try {
      const result = await integrations.auditTest(id)
      setProbes((v) => ({ ...v, [id]: `${result.latencyMs} ms` }))
    } catch (error) {
      setProbes((v) => ({ ...v, [id]: t('integrationSettings.testFailed') }))
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setProbing(null)
    }
  }
  const restoreRef = useRef<HTMLButtonElement | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLFormElement>(null)
  const open = (item: AuditNode, button: HTMLButtonElement | null) => {
    initialApiKey.current =
      credentials.draft[item.id] === undefined ? '' : credentials.draft[item.id]
    setApiKey(initialApiKey.current)
    restoreRef.current = button
    setEditor({ ...item })
    setInitial({ ...item })
    setEditorErrors({})
  }
  function apply() {
    const result = endpointSchema.safeParse(editor)
    if (!result.success) {
      setEditorErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join('.'),
            auditErrorKey(issue.message),
          ])
        )
      )
      toast.error(tr(auditErrorKey(result.error.issues[0].message)), {
        id: 'audit-endpoint-validation',
      })
      requestAnimationFrame(() =>
        dialogRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    onChange(
      value.some((item) => item.id === result.data.id)
        ? value.map((item) => (item.id === result.data.id ? result.data : item))
        : [...value, result.data]
    )
    if (apiKey !== '') credentials.set(result.data.id, apiKey)
    setProbes((previous) => {
      const next = { ...previous }
      delete next[result.data.id]
      return next
    })
    setEditor(null)
  }
  function move(index: number, offset: number) {
    const next = [...value]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    onChange(next)
  }
  return (
    <>
      <ConfigurationSection
        title={tr('pool')}
        action={
          <Button
            ref={addRef}
            type='button'
            size='sm'
            variant='outline'
            disabled={value.length >= 20}
            onClick={(event) =>
              open(
                {
                  id: crypto.randomUUID(),
                  name: '',
                  baseUrl: 'https://api.typesafe.ai',
                  model: '',
                  timeoutMs: '3000',
                  stateCharLimit: '16000',
                  proxyId: 'direct',
                  enabled: true,
                },
                event.currentTarget
              )
            }
          >
            <Plus className='size-4' aria-hidden='true' />
            {tr('addNode')}
          </Button>
        }
      >
        <div
          data-audit-field={'shared.endpoints'}
          tabIndex={-1}
          aria-invalid={Object.keys(errors).some((key) =>
            key.startsWith('shared.endpoints')
          )}
          className='rounded-lg border'
        >
          <Table aria-label={tr('pool')} className='min-w-[760px]'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='ps-4'>{tr('nodeName')}</TableHead>
                <TableHead>{tr('baseUrl')}</TableHead>
                <TableHead>{tr('model')}</TableHead>
                <TableHead>{tr('nodeStatus')}</TableHead>
                <TableHead className='text-right'>
                  {tr('enabledColumn')}
                </TableHead>
                <TableHead className='pe-4 text-right'>
                  {tr('nodeActions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!value.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className='h-24 text-center text-muted-foreground'
                  >
                    {tr('noNodes')}
                  </TableCell>
                </TableRow>
              )}
              {value.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className='ps-4 font-medium'>
                    <div className='max-w-28 truncate' title={item.name}>
                      {item.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div
                      className='max-w-44 truncate text-muted-foreground'
                      title={item.baseUrl}
                    >
                      {item.baseUrl}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='max-w-44 truncate' title={item.model}>
                      {item.model}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={credentials.dirty || !!probing}
                      title={
                        credentials.dirty
                          ? t('integrationSettings.saveFirst')
                          : t('integrationSettings.testConnection')
                      }
                      onClick={() => void probe(item.id)}
                    >
                      {probing === item.id
                        ? '...'
                        : (probes[item.id] ??
                          t('integrationSettings.testConnection'))}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end'>
                      <SwitchLabeled
                        size='sm'
                        containedMotion
                        checked={item.enabled}
                        aria-label={tr('nodeEnabled') + ' ' + item.name}
                        onCheckedChange={(enabled) =>
                          onChange(
                            value.map((node) =>
                              node.id === item.id ? { ...node, enabled } : node
                            )
                          )
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className='pe-4'>
                    <div className='flex justify-end gap-1'>
                      <IconAction
                        label={tr('moveUp') + ' ' + item.name}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden='true' className='size-4' />
                      </IconAction>
                      <IconAction
                        label={tr('moveDown') + ' ' + item.name}
                        disabled={index === value.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden='true' className='size-4' />
                      </IconAction>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type='button'
                            size='icon'
                            variant='ghost'
                            aria-label={tr('editNode') + ' ' + item.name}
                            onClick={(event) => open(item, event.currentTarget)}
                          >
                            <Pencil aria-hidden='true' className='size-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tr('editNode')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type='button'
                            size='icon'
                            variant='ghost'
                            aria-label={tr('deleteNode') + ' ' + item.name}
                            onClick={(event) => {
                              restoreRef.current = event.currentTarget
                              setRemoving(item)
                            }}
                          >
                            <Trash2 aria-hidden='true' className='size-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tr('deleteNode')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ConfigurationSection>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (
            !open &&
            (JSON.stringify(editor) !== JSON.stringify(initial) ||
              apiKey !== initialApiKey.current)
          )
            toast.warning(tr('unsavedNode'), { id: 'audit-node-dirty' })
          else if (!open) setEditor(null)
        }}
      >
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto sm:max-w-xl'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            ;(restoreRef.current?.isConnected
              ? restoreRef.current
              : addRef.current
            )?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editor && value.some((item) => item.id === editor.id)
                ? tr('editNode')
                : tr('addNode')}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('nodeConfiguration')}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              ref={dialogRef}
              className='@container/audit grid gap-4'
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                apply()
              }}
            >
              {(
                [
                  'name',
                  'baseUrl',
                  'model',
                  'timeoutMs',
                  'stateCharLimit',
                ] as const
              ).map((key) => (
                <Field
                  key={key}
                  path={key}
                  label={tr(key === 'name' ? 'nodeName' : key)}
                  value={editor[key] ?? ''}
                  placeholder={key === 'model' ? 'jev-X.Y.Z' : undefined}
                  errors={editorErrors}
                  min={
                    key === 'timeoutMs'
                      ? 100
                      : key === 'stateCharLimit'
                        ? 128
                        : undefined
                  }
                  max={
                    key === 'timeoutMs'
                      ? 30000
                      : key === 'stateCharLimit'
                        ? 100000
                        : undefined
                  }
                  onChange={(value) => {
                    setEditor({ ...editor, [key]: value })
                    setEditorErrors({})
                  }}
                />
              ))}
              <Choice
                path='proxyId'
                label={tr('proxyId')}
                value={editor.proxyId ?? 'direct'}
                options={[
                  { value: 'direct', label: tr('direct') },
                  ...(proxyOptions.data ?? [])
                    .filter((p) => p.enabled)
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
                onChange={(proxyId) => setEditor({ ...editor, proxyId })}
              />
              <div className='space-y-2'>
                <Label htmlFor='audit-node-api-key'>API Key</Label>
                <Input
                  id='audit-node-api-key'
                  type='password'
                  autoComplete='new-password'
                  maxLength={16384}
                  value={apiKey ?? ''}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    credentials.has[editor.id]
                      ? t('integrationSettings.secretSaved')
                      : ''
                  }
                />
                {credentials.has[editor.id] && (
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={() => setApiKey(null)}
                  >
                    {t('integrationSettings.clearSecret')}
                  </Button>
                )}
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setEditor(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button type='submit'>{tr('applyNode')}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null)
            restoreRef.current?.focus()
          }
        }}
        title={tr('deleteNode')}
        desc={<span className='sr-only'>{removing?.name}</span>}
        destructive
        confirmText={t('common.delete')}
        cancelBtnText={t('common.cancel')}
        handleConfirm={() => {
          onChange(value.filter((item) => item.id !== removing?.id))
          setRemoving(null)
          requestAnimationFrame(() => addRef.current?.focus())
        }}
      />
    </>
  )
}

type RuleEditor = { stage: 'prompt' | 'content'; rule: AuditRule }

function AuditRules({
  value,
  onChange,
  errors,
}: {
  value: AuditDraft
  onChange: (next: AuditDraft) => void
  errors: AuditErrors
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('auditSettings.' + key)
  const id = useId()
  const [editor, setEditor] = useState<RuleEditor | null>(null)
  const [initial, setInitial] = useState<RuleEditor | null>(null)
  const [editorErrors, setEditorErrors] = useState<AuditErrors>({})
  const [removing, setRemoving] = useState<RuleEditor | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLButtonElement | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const editing =
    !!editor &&
    value[editor.stage].rules.some((rule) => rule.id === editor.rule.id)
  const title = tr(editing ? 'editRule' : 'addRule')
  const rows = (['prompt', 'content'] as const).flatMap((stage) =>
    value[stage].rules.map((rule) => ({ stage, rule }))
  )
  const error = Object.entries(errors).find(
    ([path]) =>
      path.startsWith('prompt.rules') || path.startsWith('content.rules')
  )?.[1]
  function open(next: RuleEditor, trigger: HTMLButtonElement | null) {
    restoreRef.current = trigger
    setEditor(structuredClone(next))
    setInitial(structuredClone(next))
    setEditorErrors({})
  }
  function apply() {
    if (!editor) return
    const parsed = auditRuleSchema.safeParse(editor.rule)
    if (!parsed.success) {
      setEditorErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            auditErrorKey(issue.message),
          ])
        )
      )
      toast.error(tr(auditErrorKey(parsed.error.issues[0].message)), {
        id: 'audit-rule-validation',
      })
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    if (!editing && value[editor.stage].rules.length >= 20) {
      setEditorErrors({ stage: 'ruleLimit' })
      toast.error(tr('ruleLimit'), { id: 'audit-rule-validation' })
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    const rules = editing
      ? value[editor.stage].rules.map((rule) =>
          rule.id === parsed.data.id ? parsed.data : rule
        )
      : [...value[editor.stage].rules, parsed.data]
    onChange({ ...value, [editor.stage]: { ...value[editor.stage], rules } })
    setEditor(null)
  }
  return (
    <>
      <ConfigurationSection
        title={tr('judgmentRules')}
        action={
          <Button
            ref={addRef}
            type='button'
            variant='outline'
            size='sm'
            disabled={rows.length >= 40}
            onClick={(event) =>
              open(
                {
                  stage: value.prompt.rules.length < 20 ? 'prompt' : 'content',
                  rule: newAuditRule(),
                },
                event.currentTarget
              )
            }
          >
            <Plus className='size-4' aria-hidden='true' />
            {tr('addRule')}
          </Button>
        }
      >
        <div
          className='min-w-0 overflow-hidden rounded-lg border'
          tabIndex={-1}
          data-audit-field='rules'
          aria-label={tr('judgmentRules')}
          role='group'
          aria-invalid={!!error}
          aria-describedby={error ? id : undefined}
        >
          <Table aria-label={tr('judgmentRules')} className='min-w-[650px]'>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('ruleFields.name')}</TableHead>
                <TableHead>{tr('ruleStage')}</TableHead>
                <TableHead>{tr('ruleFields.flagThreshold')}</TableHead>
                <TableHead>{tr('ruleFields.hitThreshold')}</TableHead>
                <TableHead>{tr('enabledColumn')}</TableHead>
                <TableHead className='text-end'>{tr('nodeActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ stage, rule }) => (
                <TableRow key={stage + rule.id}>
                  <TableCell className='max-w-56 truncate' title={rule.name}>
                    {rule.name}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {tr(stage === 'prompt' ? 'input' : 'output')}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {rule.flagThreshold}%
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {rule.hitThreshold}%
                  </TableCell>
                  <TableCell>
                    <SwitchLabeled
                      size='sm'
                      containedMotion
                      aria-label={t('auditSettings.toggleRule', {
                        name: rule.name,
                      })}
                      checked={rule.enabled}
                      onCheckedChange={(enabled) =>
                        onChange({
                          ...value,
                          [stage]: {
                            ...value[stage],
                            rules: value[stage].rules.map((item) =>
                              item.id === rule.id ? { ...item, enabled } : item
                            ),
                          },
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t('auditSettings.editNamedRule', {
                          name: rule.name,
                        })}
                        onClick={(event) =>
                          open({ stage, rule }, event.currentTarget)
                        }
                      >
                        <Pencil className='size-4' aria-hidden='true' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t('auditSettings.deleteNamedRule', {
                          name: rule.name,
                        })}
                        onClick={(event) => {
                          restoreRef.current = event.currentTarget
                          setRemoving({ stage, rule })
                        }}
                      >
                        <Trash2 className='size-4' aria-hidden='true' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className='h-20 text-center text-muted-foreground'
                  >
                    <span className='block w-fit sm:mx-auto'>
                      {tr('noRules')}
                    </span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {error && (
          <span id={id} className='sr-only'>
            {tr(error)}
          </span>
        )}
      </ConfigurationSection>
      <Dialog
        open={!!editor}
        onOpenChange={(next) => {
          if (next) return
          if (JSON.stringify(editor) !== JSON.stringify(initial))
            toast.warning(tr('unsavedOptions'), { id: 'audit-rule-dirty' })
          else setEditor(null)
        }}
      >
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-xl'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className='sr-only'>{title}</DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              ref={formRef}
              className='@container/audit space-y-4'
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                apply()
              }}
            >
              {editing ? (
                <Badge variant='secondary'>
                  {tr(editor.stage === 'prompt' ? 'input' : 'output')}
                </Badge>
              ) : (
                <Choice
                  path='stage'
                  label={tr('ruleStage')}
                  value={editor.stage}
                  errors={editorErrors}
                  options={(['prompt', 'content'] as const).map((stage) => ({
                    value: stage,
                    label: tr(stage === 'prompt' ? 'input' : 'output'),
                  }))}
                  onChange={(stage) => {
                    setEditor({
                      ...editor,
                      stage: stage as RuleEditor['stage'],
                    })
                    setEditorErrors({})
                  }}
                />
              )}
              <Toggle
                label={tr('ruleEnabled')}
                checked={editor.rule.enabled}
                onChange={(enabled) =>
                  setEditor({ ...editor, rule: { ...editor.rule, enabled } })
                }
              />
              <div className='grid gap-4 @lg/audit:grid-cols-2'>
                {(
                  [
                    'name',
                    'instructions',
                    'trueCriteria',
                    'falseCriteria',
                    'flagThreshold',
                    'hitThreshold',
                  ] as const
                ).map((key) => (
                  <div
                    key={key}
                    className={
                      ['name', 'instructions'].includes(key)
                        ? '@lg/audit:col-span-2'
                        : undefined
                    }
                  >
                    <Field
                      path={key}
                      label={tr('ruleFields.' + key)}
                      value={editor.rule[key]}
                      errors={editorErrors}
                      multiline={[
                        'instructions',
                        'trueCriteria',
                        'falseCriteria',
                      ].includes(key)}
                      maxLength={key === 'name' ? 80 : 2000}
                      min={key.endsWith('Threshold') ? 0 : undefined}
                      max={100}
                      step='0.01'
                      onChange={(next) => {
                        setEditor({
                          ...editor,
                          rule: { ...editor.rule, [key]: next },
                        })
                        setEditorErrors({})
                      }}
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setEditor(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button type='submit'>{tr('applyNode')}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(next) => {
          if (!next) {
            setRemoving(null)
            requestAnimationFrame(() => restoreRef.current?.focus())
          }
        }}
        title={tr('deleteRule')}
        desc={removing?.rule.name ?? ''}
        confirmText={t('common.delete')}
        destructive
        handleConfirm={() => {
          if (!removing) return
          const { stage, rule } = removing
          onChange({
            ...value,
            [stage]: {
              ...value[stage],
              rules: value[stage].rules.filter((item) => item.id !== rule.id),
            },
          })
          setRemoving(null)
          requestAnimationFrame(() => addRef.current?.focus())
        }}
      />
    </>
  )
}

const auditOptionSchemas = {
  policy: z.object({
    prompt: responseRulesSchema,
    content: responseRulesSchema.extend(deliveryRulesSchema.shape),
  }),
  detection: z.object({
    shared: executionRulesSchema.extend(keywordRulesSchema.shape),
  }),
  retention: z.object({ shared: retentionRulesSchema }),
}

type AuditOptionsKind = keyof typeof auditOptionSchemas

function AuditOptionsDialog({
  kind,
  value,
  onChange,
  errors: pageErrors = {},
}: {
  kind: AuditOptionsKind
  value: AuditDraft
  onChange: (next: AuditDraft) => void
  errors?: AuditErrors
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('auditSettings.' + key)
  const schema = auditOptionSchemas[kind]
  const title = tr(kind)
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => structuredClone(value))
  const [initial, setInitial] = useState(() => structuredClone(value))
  const [stage, setStage] = useState<'prompt' | 'content'>('prompt')
  const [errors, setErrors] = useState<AuditErrors>({})
  const paths = Object.entries(schema.shape).flatMap(([section, fields]) =>
    Object.keys(fields.shape).map((key) => section + '.' + key)
  )
  const pageError = Object.entries(pageErrors).find(([path]) =>
    paths.includes(path)
  )
  const ref = useRef<HTMLFormElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const patchShared = (next: Partial<AuditDraft['shared']>) => {
    setDraft((current) => ({
      ...current,
      shared: { ...current.shared, ...next },
    }))
    setErrors({})
  }
  const patchStage = (
    section: 'prompt' | 'content',
    next: Partial<AuditDraft['content']>
  ) => {
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], ...next },
    }))
    setErrors({})
  }
  const updateOpen = (next: boolean) => {
    if (next) {
      setDraft(structuredClone(value))
      setInitial(structuredClone(value))
      setErrors({})
      setStage(pageError?.[0].startsWith('content.') ? 'content' : 'prompt')
      setOpen(true)
    } else if (JSON.stringify(draft) !== JSON.stringify(initial))
      toast.warning(tr('unsavedOptions'), { id: 'audit-' + kind + '-dirty' })
    else setOpen(false)
  }
  function apply() {
    const result = schema.safeParse(draft)
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join('.'),
            auditErrorKey(issue.message),
          ])
        )
      )
      const first = result.error.issues[0]
      if (kind === 'policy')
        setStage(first.path[0] === 'content' ? 'content' : 'prompt')
      toast.error(tr(auditErrorKey(first.message)), {
        id: 'audit-' + kind + '-validation',
      })
      requestAnimationFrame(() =>
        ref.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    const fields = result.data
    onChange({
      ...value,
      ...('shared' in fields
        ? { shared: { ...value.shared, ...fields.shared } }
        : {}),
      ...('prompt' in fields
        ? {
            prompt: { ...value.prompt, ...fields.prompt },
            content: { ...value.content, ...fields.content },
          }
        : {}),
    })
    setOpen(false)
  }
  function responseFields(section: 'prompt' | 'content') {
    const current = draft[section]
    return (
      <div className='space-y-4'>
        <Choice
          path={section + '.mode'}
          label={tr('mode')}
          value={current.mode}
          options={['observe', 'block'].map((key) => ({
            value: key,
            label: tr(key),
          }))}
          onChange={(mode) =>
            patchStage(section, { mode: mode as AuditDraft['prompt']['mode'] })
          }
        />
        <Choice
          path={section + '.failureAction'}
          label={tr('failureAction')}
          value={current.failureAction}
          options={['block', 'allow'].map((key) => ({
            value: key,
            label: tr('failureActions.' + key),
          }))}
          onChange={(failureAction) =>
            patchStage(section, {
              failureAction:
                failureAction as AuditDraft['prompt']['failureAction'],
            })
          }
        />
        {(['emailOnHit', 'autoBan'] as const).map((key) => (
          <Toggle
            key={key}
            label={tr(key)}
            checked={current[key]}
            onChange={(next) => patchStage(section, { [key]: next })}
          />
        ))}
        <div className='grid gap-4 @lg/audit:grid-cols-2'>
          <Choice
            path={section + '.blockStatus'}
            label={tr('blockStatus')}
            value={current.blockStatus}
            options={['400', '403', '422'].map((status) => ({
              value: status,
              label: status,
            }))}
            onChange={(blockStatus) =>
              patchStage(section, {
                blockStatus:
                  blockStatus as AuditDraft['content']['blockStatus'],
              })
            }
          />
          <Field
            path={section + '.banThreshold'}
            label={tr('banThreshold')}
            value={current.banThreshold}
            min={1}
            max={10000}
            errors={errors}
            onChange={(banThreshold) => patchStage(section, { banThreshold })}
          />
          <Field
            path={section + '.violationHours'}
            label={tr('violationHours')}
            value={current.violationHours}
            min={1}
            max={87600}
            errors={errors}
            onChange={(violationHours) =>
              patchStage(section, { violationHours })
            }
          />
          <Field
            path={section + '.blockMessage'}
            label={tr('blockMessage')}
            value={current.blockMessage}
            errors={errors}
            placeholder={tr('defaultBlockMessage')}
            onChange={(blockMessage) => patchStage(section, { blockMessage })}
          />
        </div>
      </div>
    )
  }
  return (
    <>
      <Button
        ref={trigger}
        type='button'
        variant='outline'
        size='sm'
        className='px-2 has-[>svg]:px-2'
        onClick={() => updateOpen(true)}
        data-audit-field={kind}
        aria-invalid={!!pageError}
        aria-describedby={pageError ? errorId : undefined}
      >
        <Settings2 aria-hidden='true' className='size-4' />
        {title}
      </Button>
      {pageError && (
        <span id={errorId} className='sr-only'>
          {tr(pageError[1])}
        </span>
      )}
      <Dialog open={open} onOpenChange={updateOpen}>
        <DialogContent
          ref={contentRef}
          className='max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-xl'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className='sr-only'>{title}</DialogDescription>
          </DialogHeader>
          <form
            ref={ref}
            noValidate
            className='@container/audit space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              apply()
            }}
          >
            {kind === 'policy' ? (
              <Tabs
                value={stage}
                onValueChange={(next) => {
                  setStage(next as 'prompt' | 'content')
                  contentRef.current?.scrollTo({ top: 0 })
                }}
                className='gap-4'
              >
                <TabsList className='w-full' aria-label={title}>
                  <TabsTrigger value='prompt'>{tr('input')}</TabsTrigger>
                  <TabsTrigger value='content'>{tr('output')}</TabsTrigger>
                </TabsList>
                <TabsContent value='prompt'>
                  {responseFields('prompt')}
                </TabsContent>
                <TabsContent value='content' className='space-y-4'>
                  {responseFields('content')}
                  <Separator />
                  <ConfigurationSection title={tr('delivery')}>
                    <Choice
                      path='content.delivery'
                      label={tr('deliveryMode')}
                      value={draft.content.delivery}
                      options={['buffered', 'observe'].map((key) => ({
                        value: key,
                        label: tr('deliveryModes.' + key),
                      }))}
                      errors={errors}
                      onChange={(delivery) =>
                        patchStage('content', {
                          delivery:
                            delivery as AuditDraft['content']['delivery'],
                        })
                      }
                    />
                    <Field
                      path='content.maxOutputChars'
                      label={tr('maxOutputChars')}
                      value={draft.content.maxOutputChars}
                      min={128}
                      max={1000000}
                      errors={errors}
                      onChange={(maxOutputChars) =>
                        patchStage('content', { maxOutputChars })
                      }
                    />
                  </ConfigurationSection>
                </TabsContent>
              </Tabs>
            ) : kind === 'detection' ? (
              <>
                <ConfigurationSection title={tr('execution')}>
                  <>
                    <div className='grid gap-4 @lg/audit:grid-cols-2'>
                      <Field
                        path={'shared.retries'}
                        label={tr('retries')}
                        value={draft.shared.retries}
                        min={0}
                        max={10}
                        errors={errors}
                        onChange={(retries) => patchShared({ retries })}
                      />
                      <Field
                        path={'shared.sampleRate'}
                        label={tr('sampleRate')}
                        value={draft.shared.sampleRate}
                        min={0}
                        max={100}
                        step='0.01'
                        errors={errors}
                        onChange={(sampleRate) => patchShared({ sampleRate })}
                      />
                    </div>
                  </>
                </ConfigurationSection>
                <Separator />
                <ConfigurationSection title={tr('keywords')}>
                  <>
                    <Choice
                      path={'shared.keywordMode'}
                      label={tr('keywordMode')}
                      value={draft.shared.keywordMode}
                      options={[
                        'keyword_only',
                        'keyword_and_api',
                        'api_only',
                      ].map((key) => ({
                        value: key,
                        label: tr('keywordModes.' + key),
                      }))}
                      onChange={(keywordMode) =>
                        patchShared({
                          keywordMode:
                            keywordMode as AuditDraft['shared']['keywordMode'],
                        })
                      }
                    />
                    <Field
                      path={'shared.keywords'}
                      label={tr('keywordList')}
                      value={draft.shared.keywords}
                      multiline
                      errors={errors}
                      onChange={(keywords) => patchShared({ keywords })}
                    />
                  </>
                </ConfigurationSection>
              </>
            ) : (
              <>
                <Toggle
                  label={tr('recordNonHits')}
                  checked={draft.shared.recordNonHits}
                  onChange={(recordNonHits) => patchShared({ recordNonHits })}
                />
                <Field
                  path={'shared.hitRetentionDays'}
                  label={tr('hitRetentionDays')}
                  value={draft.shared.hitRetentionDays}
                  min={1}
                  max={3650}
                  errors={errors}
                  onChange={(hitRetentionDays) =>
                    patchShared({ hitRetentionDays })
                  }
                />
                <Field
                  path={'shared.nonHitRetentionDays'}
                  label={tr('nonHitRetentionDays')}
                  value={draft.shared.nonHitRetentionDays}
                  min={1}
                  max={3}
                  errors={errors}
                  onChange={(nonHitRetentionDays) =>
                    patchShared({ nonHitRetentionDays })
                  }
                />
              </>
            )}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type='submit'>{tr('applyNode')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type AuditCredentials = {
  draft: Record<string, string | null>
  set: (id: string, value: string | null) => void
  has: Record<string, boolean>
  dirty: boolean
}
export function AuditSettings({
  value,
  onChange,
  errors,
  formRef,
  onSave,
  credentials,
}: {
  value: AuditDraft
  onChange: (value: AuditDraft) => void
  errors: AuditErrors
  formRef: RefObject<HTMLFormElement | null>
  onSave: () => void
  credentials: AuditCredentials
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('auditSettings.' + key)
  return (
    <form
      ref={formRef}
      noValidate
      className='@container/audit w-full space-y-6'
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <ConfigurationSection
        title={tr('controls')}
        action={
          <div className='flex flex-wrap gap-1.5'>
            {(['policy', 'detection', 'retention'] as const).map((kind) => (
              <AuditOptionsDialog
                key={kind}
                errors={errors}
                kind={kind}
                value={value}
                onChange={onChange}
              />
            ))}
          </div>
        }
      >
        <div className='grid grid-cols-1 gap-3 @lg/audit:grid-cols-2'>
          {(['prompt', 'content'] as const).map((stage) => (
            <SettingsControlCard
              key={stage}
              compact
              title={tr(stage === 'prompt' ? 'input' : 'output')}
            >
              <SwitchLabeled
                size='sm'
                containedMotion
                aria-label={tr(
                  stage === 'prompt' ? 'promptEnabled' : 'contentEnabled'
                )}
                checked={value[stage].enabled}
                onCheckedChange={(enabled) =>
                  onChange({ ...value, [stage]: { ...value[stage], enabled } })
                }
              />
            </SettingsControlCard>
          ))}
        </div>
      </ConfigurationSection>
      <AuditRules value={value} onChange={onChange} errors={errors} />
      <EndpointPool
        credentials={credentials}
        value={value.shared.endpoints}
        errors={errors}
        onChange={(endpoints) =>
          onChange({ ...value, shared: { ...value.shared, endpoints } })
        }
      />
      <AuditGroups
        value={value.shared.groupIds}
        errors={errors}
        onChange={(groupIds) =>
          onChange({ ...value, shared: { ...value.shared, groupIds } })
        }
      />
    </form>
  )
}
