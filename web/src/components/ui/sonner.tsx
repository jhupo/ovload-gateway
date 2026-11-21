import { Toaster as Sonner, ToasterProps } from 'sonner'
import { useTheme } from '@/context/theme-provider'
import { useIsMobile } from '@/hooks/use-mobile'

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme()
  const isMobile = useIsMobile()
  const bottomOffset = isMobile
    ? 'calc(var(--toast-mobile-clearance, 5rem) + env(safe-area-inset-bottom))'
    : 24

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className='toaster group [&_div[data-content]]:w-full'
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
      position='bottom-right'
      offset={{ bottom: bottomOffset, right: 24, left: 24 }}
      mobileOffset={{
        bottom: bottomOffset,
        right: 16,
        left: 16,
      }}
    />
  )
}
