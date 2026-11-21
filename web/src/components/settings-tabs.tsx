import type { ComponentProps } from 'react'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'

type SettingsTabsProps = Omit<
  ComponentProps<typeof TabsVertical>,
  'className' | 'navigationClassName' | 'fillContent'
>

export function SettingsTabs({ children, ...props }: SettingsTabsProps) {
  return (
    <TabsVertical
      {...props}
      className='md:gap-12'
      navigationClassName='md:w-60 md:pr-13'
      fillContent
    >
      <div className='flex min-h-0 flex-1 flex-col p-1'>{children}</div>
    </TabsVertical>
  )
}
