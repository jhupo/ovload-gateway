import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { AuthSettings } from '@/api/auth-settings'
import { ApiError } from '@/api/errors'
import { useAuthSettings } from './use-auth-settings'

const api = vi.hoisted(() => ({ load: vi.fn(), update: vi.fn() }))
const notices = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('@/api/auth-settings', () => ({ authSettingsApi: api }))
vi.mock('sonner', () => ({ toast: notices }))

const initial: AuthSettings = {
  revision: 1,
  registration_enabled: false,
  verification_required: false,
  recovery_enabled: false,
  enabled_providers: [],
  allowed_domains: [],
  default_user_concurrency: 20,
  default_user_rpm: 1200,
  default_customer_concurrency: 100,
  default_customer_rpm: 6000,
  gift_usd: '0',
  agreement: { enabled: false, mode: 'modal', updated: '', documents: [] },
}

function Harness() {
  const settings = useAuthSettings(true)
  return (
    <>
      <output aria-label='State'>
        {JSON.stringify({
          ready: settings.ready,
          pending: settings.pending,
          dirty: settings.dirty,
          issue: settings.issue,
          loadFailed: settings.loadFailed,
          errors: settings.errors,
        })}
      </output>
      <button
        onClick={() =>
          settings.setDraft({ ...settings.draft!, registration_enabled: true })
        }
      >
        Edit
      </button>
      <button
        onClick={() =>
          settings.setDraft({
            ...settings.draft!,
            agreement: { ...settings.draft!.agreement, enabled: true },
          })
        }
      >
        Enable terms
      </button>
      <button onClick={() => void settings.save()}>Save</button>
      <button onClick={() => void settings.load()}>Reload</button>
    </>
  )
}

async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = await render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
  await expect
    .element(view.getByLabelText('State'))
    .toHaveTextContent('"ready":true')
  return view
}

describe('authentication settings persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.load.mockResolvedValue(structuredClone(initial))
  })
  afterEach(() => vi.restoreAllMocks())

  it('saves changes with the loaded revision and adopts the response', async () => {
    api.update.mockResolvedValue({
      ...initial,
      revision: 2,
      registration_enabled: true,
    })
    const view = await setup()
    await userEvent.click(
      view.getByRole('button', { name: 'Edit', exact: true })
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await vi.waitFor(() => expect(notices.success).toHaveBeenCalled())
    expect(api.update).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, registration_enabled: true }),
      expect.any(AbortSignal)
    )
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"dirty":false')
  })

  it('rejects enabled agreements without documents before sending a request', async () => {
    const view = await setup()
    await userEvent.click(view.getByRole('button', { name: 'Enable terms' }))
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await vi.waitFor(() => expect(notices.error).toHaveBeenCalled())
    expect(api.update).not.toHaveBeenCalled()
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"agreement":')
  })

  it('preserves the draft and allows retry when a failed save did not change the server', async () => {
    api.update
      .mockRejectedValueOnce(
        new ApiError(503, 'identity.unavailable', 'Unavailable')
      )
      .mockResolvedValueOnce({
        ...initial,
        revision: 2,
        registration_enabled: true,
      })
    const view = await setup()
    await userEvent.click(
      view.getByRole('button', { name: 'Edit', exact: true })
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await vi.waitFor(() => expect(notices.error).toHaveBeenCalled())
    expect(api.load).toHaveBeenCalledTimes(2)
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"issue":null')
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"dirty":true')
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await vi.waitFor(() => expect(notices.success).toHaveBeenCalled())
    expect(api.update).toHaveBeenCalledTimes(2)
  })

  it('requires a fresh snapshot after a conflict and recovers on reload', async () => {
    api.update.mockRejectedValueOnce(
      new ApiError(409, 'identity.conflict', 'Conflict')
    )
    const view = await setup()
    await userEvent.click(
      view.getByRole('button', { name: 'Edit', exact: true })
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"issue":"conflict"')
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    expect(api.update).toHaveBeenCalledTimes(1)
    api.load.mockResolvedValueOnce({ ...initial, revision: 2 })
    await userEvent.click(
      view.getByRole('button', { name: 'Reload', exact: true })
    )
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"issue":null')
    api.update.mockResolvedValueOnce({
      ...initial,
      revision: 3,
      registration_enabled: true,
    })
    await userEvent.click(
      view.getByRole('button', { name: 'Edit', exact: true })
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await vi.waitFor(() => expect(notices.success).toHaveBeenCalled())
    expect(api.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: 2 }),
      expect.any(AbortSignal)
    )
  })

  it('blocks another write until the result of an uncertain save is reloaded', async () => {
    const view = await setup()
    api.update.mockRejectedValueOnce(new TypeError('Network failed'))
    api.load.mockRejectedValueOnce(new TypeError('Network failed'))
    await userEvent.click(
      view.getByRole('button', { name: 'Edit', exact: true })
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await expect
      .element(view.getByLabelText('State'))
      .toHaveTextContent('"issue":"saveUnconfirmed"')
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    expect(api.update).toHaveBeenCalledTimes(1)
  })
})
