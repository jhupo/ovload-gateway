// Adapted from Shadcn Space Number Ticker 01 under its Free License.
// Copyright (c) 2026 Shadcn Space. Source: https://shadcnspace.com/components/number-ticker
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

const subscribeToReducedMotion = (onChange: () => void) => {
  const media = matchMedia(reducedMotionQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const getReducedMotion = () => matchMedia(reducedMotionQuery).matches

type NumberTickerProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  value: number
  startValue?: number
  duration?: number
  delay?: number
  locale?: string
  formatOptions?: Intl.NumberFormatOptions
  prefix?: string
  suffix?: string
}

export function NumberTicker({
  value,
  startValue = 0,
  duration = 0.7,
  delay = 0,
  locale,
  formatOptions,
  prefix = '',
  suffix = '',
  className,
  ...props
}: NumberTickerProps) {
  const reduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    () => false
  )
  const previousValue = useRef(startValue)
  const [displayValue, setDisplayValue] = useState(
    reduceMotion ? value : startValue
  )
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, formatOptions),
    [formatOptions, locale]
  )

  useEffect(() => {
    const from = previousValue.current

    let frame = 0
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined
    if (reduceMotion) {
      previousValue.current = value
      return
    }

    let startedAt: number | undefined
    const animate = (timestamp: number) => {
      startedAt ??= timestamp
      const progress = Math.min((timestamp - startedAt) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(from + (value - from) * eased)
      if (progress < 1) frame = requestAnimationFrame(animate)
      else previousValue.current = value
    }

    const start = () => {
      if (duration <= 0) {
        frame = requestAnimationFrame(() => {
          setDisplayValue(value)
          previousValue.current = value
        })
        return
      }
      frame = requestAnimationFrame(animate)
    }

    if (delay > 0) timeout = globalThis.setTimeout(start, delay * 1000)
    else start()

    return () => {
      if (timeout) globalThis.clearTimeout(timeout)
      cancelAnimationFrame(frame)
    }
  }, [delay, duration, reduceMotion, value])

  const displayed = `${prefix}${formatter.format(reduceMotion ? value : displayValue)}${suffix}`
  const finalValue = `${prefix}${formatter.format(value)}${suffix}`

  return (
    <span
      data-slot='number-ticker'
      aria-label={finalValue}
      className={cn('tabular-nums', className)}
      {...props}
    >
      <span aria-hidden>{displayed}</span>
    </span>
  )
}
