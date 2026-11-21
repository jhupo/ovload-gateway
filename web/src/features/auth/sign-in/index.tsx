import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Logo } from '@/assets/logo'
import { useSiteIdentity } from '@/hooks/use-site-identity'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const identity = useSiteIdentity()
  const brand = identity.data?.name || 'Ovload'
  return (
    <AuthLayout>
      <div className='auth-brand'>
        <Link
          to='/'
          aria-label={brand}
          className='flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background'
        >
          <Logo aria-hidden='true' />
          <span className='text-xl font-medium tracking-tight'>{brand}</span>
        </Link>
      </div>
      <Card className='auth-card shadow-sm'>
        <CardHeader className='space-y-2'>
          <CardTitle className='text-lg'>{t('auth.sign_in_title')}</CardTitle>
          <CardDescription>
            {t('auth.sign_in_desc')}. {t('auth.no_account')}{' '}
            <Link
              to='/sign-up'
              className='underline underline-offset-4 hover:text-primary'
            >
              {t('auth.sign_up_title')}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
