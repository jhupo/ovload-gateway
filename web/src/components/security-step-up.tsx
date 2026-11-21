import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import { sessionPort } from '@/api/session-port'
import { installStepUpHandler } from '@/api/step-up'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type PendingVerification = {
  resolve: () => void
  reject: (error: Error) => void
}

/** Owns sensitive-operation verification UI; the transport only sees a handler. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<PendingVerification | null>(null)

  useEffect(() => {
    const uninstall = installStepUpHandler(async () => {
      const session = sessionPort().getSession()
      if (session?.audience !== 'management') return
      const sessionId = session.id
      const csrf = session.csrf_token
      const expired = () => {
        sessionPort().invalidateSession(sessionId)
        return new ApiError(401, 'identity.unauthorized', '登录状态已过期', undefined, sessionId)
      }
      if (!csrf) throw expired()
      const status = await fetch('/api/admin/v1/auth/step-up/status', {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (status.status === 401) throw expired()
      if (!status.ok) throw new Error('无法检查安全认证状态')
      if ((await status.json()).allowed) return
      await new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject }
        setPassword('')
        setOpen(true)
      })
    })
    return uninstall
  }, [])

  const close = (error?: Error) => {
    const request = pending.current
    pending.current = null
    setOpen(false)
    setPassword('')
    if (!request) return
    if (error) request.reject(error)
    else request.resolve()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const session = sessionPort().getSession()
    const request = pending.current
    if (!request || session?.audience !== 'management' || !session.csrf_token) {
      close(new Error('登录状态已变化'))
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/admin/v1/auth/step-up', {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf_token,
        },
        body: JSON.stringify({ password }),
      })
      if (response.status === 401) {
        sessionPort().invalidateSession(session.id)
        close(new ApiError(401, 'identity.unauthorized', '登录状态已过期'))
        return
      }
      if (!response.ok) throw new Error('验证失败，请检查密码或稍后重试')
      close()
    } catch (error) {
      toast.error(
        error instanceof TypeError
          ? '无法完成身份验证，请稍后重试'
          : error instanceof Error
            ? error.message
            : '验证失败',
        { id: 'security-step-up' }
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {children}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) close(new Error('已取消验证'))
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>验证身份</DialogTitle>
            <DialogDescription>请输入当前登录密码，验证后十分钟内可进行敏感操作。</DialogDescription>
          </DialogHeader>
          <form className='space-y-4' onSubmit={submit}>
            <Input
              aria-label='登录密码'
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              autoFocus
              required
            />
            <Button disabled={busy}>验证并继续</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
