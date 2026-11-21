import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { setHumanToken } from '@/lib/human-verification'
import { RequestErrorToast } from '@/components/request-error-toast'

type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
  reset: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}
let pending: Promise<void> | undefined
function load() {
  if (window.turnstile) return Promise.resolve()
  if (!pending)
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        pending = undefined
        reject(new Error('验证码加载失败'))
      }
      document.head.append(script)
    })
  return pending
}
export function HumanVerification() {
  const ref = useRef<HTMLDivElement>(null)
  const query = useQuery({
    queryKey: ['public-security-policy'],
    queryFn: async () => {
      const r = await fetch('/api/v1/auth/security-policy', {
        cache: 'no-store',
      })
      if (!r.ok) throw new Error('验证码设置加载失败')
      return r.json() as Promise<{
        humanVerification: boolean
        siteKey: string
      }>
    },
    retry: false,
    staleTime: 0,
  })
  useEffect(() => {
    if (!query.data?.humanVerification) return
    let disposed = false,
      id: string | undefined
    const reset = () => {
      setHumanToken('')
      if (id) window.turnstile?.reset(id)
    }
    window.addEventListener('ovload-human-reset', reset)
    void load()
      .then(() => {
        if (!disposed && ref.current)
          id = window.turnstile?.render(ref.current, {
            sitekey: query.data.siteKey,
            callback: (value: string) => {
              setHumanToken(value)
            },
            'expired-callback': () => {
              setHumanToken('')
            },
            'error-callback': () => {
              setHumanToken('')
            },
          })
      })
      .catch(() => {
        if (!disposed)
          toast.error('验证码加载失败，请稍后重试', {
            id: 'human-verification-script',
          })
      })
    return () => {
      disposed = true
      setHumanToken('')
      window.removeEventListener('ovload-human-reset', reset)
      if (id) window.turnstile?.remove(id)
    }
  }, [query.data])
  return (
    <div ref={ref}>
      {query.isError && (
        <RequestErrorToast
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      )}
    </div>
  )
}
