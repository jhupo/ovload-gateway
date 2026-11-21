import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/theme-provider'
import { ThemeToggleIconButton } from '@/components/shadcn-space/toggle/toggle-01'

export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useTranslation()

  useEffect(() => {
    const themeColor = resolvedTheme === 'dark' ? '#020817' : '#fff'
    const metaThemeColor = document.querySelector("meta[name='theme-color']")
    if (metaThemeColor) metaThemeColor.setAttribute('content', themeColor)
  }, [resolvedTheme])

  return (
    <ThemeToggleIconButton
      isDark={resolvedTheme === 'dark'}
      label={t('theme.toggle_theme')}
      onToggle={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    />
  )
}
