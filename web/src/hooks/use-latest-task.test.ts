import { describe, expect, it, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { useLatestTask } from './use-latest-task'

function deferred() {
  let resolve!: (value: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('useLatestTask', () => {
  it('keeps the latest result when tasks complete out of order', async () => {
    const { result, act } = await renderHook(useLatestTask)
    const first = deferred()
    const second = deferred()
    const accept = vi.fn()
    const error = vi.fn()
    let older!: Promise<void>
    let newer!: Promise<void>
    await act(() => {
      older = result.current.run(() => first.promise, accept, error)
    })
    await act(() => {
      newer = result.current.run(() => second.promise, accept, error)
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      second.resolve('new')
      await newer
    })
    await act(async () => {
      first.resolve('old')
      await older
    })
    expect(accept.mock.calls).toEqual([['new']])
    expect(error).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it('ignores canceled successes and superseded errors without clearing a newer pending task', async () => {
    const { result, act } = await renderHook(useLatestTask)
    const canceled = deferred()
    const failed = deferred()
    const active = deferred()
    const accept = vi.fn()
    const error = vi.fn()
    let old!: Promise<void>
    let stale!: Promise<void>
    let current!: Promise<void>
    await act(() => {
      old = result.current.run(() => canceled.promise, accept, error)
    })
    await act(() => result.current.cancel())
    await act(async () => {
      canceled.resolve('discarded')
      await old
    })
    expect(accept).not.toHaveBeenCalled()
    await act(() => {
      stale = result.current.run(() => failed.promise, accept, error)
    })
    await act(() => {
      current = result.current.run(() => active.promise, accept, error)
    })
    await act(async () => {
      failed.reject(new Error('stale'))
      await stale
    })
    expect(error).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(true)
    await act(async () => {
      active.reject(new Error('current'))
      await current
    })
    expect(error).toHaveBeenCalledOnce()
    expect(result.current.pending).toBe(false)
  })

  it('never calls completion callbacks after unmount', async () => {
    const { result, act, unmount } = await renderHook(useLatestTask)
    const task = deferred()
    const accept = vi.fn()
    const error = vi.fn()
    let running!: Promise<void>
    await act(() => {
      running = result.current.run(() => task.promise, accept, error)
    })
    await unmount()
    task.resolve('unmounted')
    await running
    expect(accept).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
