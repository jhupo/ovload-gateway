import { useSyncExternalStore } from 'react'

function createClock(interval: number) {
  let now = Date.now()
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()
  const update = () => {
    now = Date.now()
    listeners.forEach((listener) => listener())
  }
  return {
    snapshot: () => now,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) {
        update()
        timer = setInterval(update, interval)
        window.addEventListener('focus', update)
        document.addEventListener('visibilitychange', update)
      }
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          clearInterval(timer)
          window.removeEventListener('focus', update)
          document.removeEventListener('visibilitychange', update)
        }
      }
    },
  }
}
const clocks = new Map<number, ReturnType<typeof createClock>>()
// Rows share a timer; the last subscriber cleans it up.
export function useClock(interval = 1000) {
  let clock = clocks.get(interval)
  if (!clock) {
    clock = createClock(interval)
    clocks.set(interval, clock)
  }
  return useSyncExternalStore(clock.subscribe, clock.snapshot, clock.snapshot)
}
