import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { SignUpForm } from './components/sign-up-form'

export function SignUp() {
  const { t } = useTranslation()
  return (
    <AuthLayout
      action={
        <Button
          asChild
          variant='ghost'
          className='me-2 h-10 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground'
        >
          <Link to='/sign-in'>
            {t('auth.sign_in_btn')}
            <ArrowRight className='size-3.5' aria-hidden='true' />
          </Link>
        </Button>
      }
    >
      <Card className='auth-card shadow-xl shadow-black/5 dark:shadow-black/25'>
        <CardHeader className='flex items-center justify-center'>
          <Link
            to='/'
            className='rounded-sm text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card'
          >
            Ovload
          </Link>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
