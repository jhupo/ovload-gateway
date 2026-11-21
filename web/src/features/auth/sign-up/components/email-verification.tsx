import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function EmailVerification({
  email,
  onBack,
}: {
  email?: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState(false)
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setInvalid(true)
      input.current?.focus()
      toast.error(t('identity.invalidToken'))
      return
    }
    setPending(true)
    try {
      await apiRequest('customer', '/auth/registrations/verify', {
        method: 'POST',
        public: true,
        body: { token },
      })
      setToken('')
      toast.success(t('identity.emailVerified'))
      onBack()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }
  return (
    <form noValidate onSubmit={verify} className='auth-step grid gap-6'>
      <div className='text-center'>
        <h1 className='text-lg font-semibold'>{t('auth.verify_email')}</h1>
        {email && (
          <p className='text-sm break-all text-muted-foreground'>{email}</p>
        )}
      </div>
      <div className='space-y-2'>
        <Label htmlFor='registration-token'>{t('identity.token')}</Label>
        <Input
          ref={input}
          id='registration-token'
          value={token}
          aria-invalid={invalid}
          autoComplete='off'
          onChange={(e) => {
            setToken(e.target.value)
            setInvalid(false)
          }}
        />
      </div>
      <Button
        type='submit'
        className='auth-submit h-11 w-full'
        disabled={pending}
      >
        <Check className='size-4' aria-hidden='true' />
        {t('identity.verify')}
      </Button>
      <Button type='button' variant='ghost' onClick={onBack} disabled={pending}>
        <ArrowLeft className='size-4' aria-hidden='true' />
        {t('auth.back_to_registration')}
      </Button>
    </form>
  )
}
