import { LanguageSwitch } from '@/components/language-switch'
import { ThemeSwitch } from '@/components/theme-switch'
import './auth.css'

export function AuthLayout({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <main className='auth-page'>
      <header className='absolute end-6 top-6 flex items-center gap-2'>
        {action}
        <ThemeSwitch />
        <LanguageSwitch />
      </header>
      <div className='auth-surface'>{children}</div>
    </main>
  )
}
