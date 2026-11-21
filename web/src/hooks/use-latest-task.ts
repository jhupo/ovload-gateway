import { useCallback, useEffect, useRef, useState } from 'react'

export function useLatestTask() {
  const generation = useRef(0)
  const [pending, setPending] = useState(false)
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )

  const cancel = useCallback(() => {
    generation.current++
    setPending(false)
  }, [])

  const run = useCallback(
    async <T>(
      task: () => Promise<T>,
      onSuccess: (value: T) => void,
      onError: (error: unknown) => void
    ) => {
      const current = ++generation.current
      setPending(true)
      try {
        const value = await task()
        if (current === generation.current) onSuccess(value)
      } catch (error) {
        if (current === generation.current) onError(error)
      } finally {
        if (current === generation.current) setPending(false)
      }
    },
    []
  )

  return { pending, run, cancel }
}
