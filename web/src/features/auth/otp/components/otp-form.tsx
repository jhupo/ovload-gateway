import { useNavigate } from '@tanstack/react-router'
import { EmailVerification } from '../../sign-up/components/email-verification'

export function OtpForm() {
  const navigate = useNavigate()
  return (
    <EmailVerification
      email=''
      onBack={() => void navigate({ to: '/sign-in' })}
    />
  )
}
