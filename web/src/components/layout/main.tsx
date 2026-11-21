import { cn } from '@/lib/utils'

type MainProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  fluid?: boolean
  ref?: React.Ref<HTMLElement>
}

export function Main({ fixed, className, fluid, ...props }: MainProps) {
  return (
    <main
      data-layout={fixed ? 'fixed' : 'auto'}
      className={cn(
        'flex flex-col gap-5 px-4 pt-5 pb-6 md:px-6',
        '[&>[data-slot=page-heading]]:shrink-0 [&>[data-slot=page-heading]]:border-b [&>[data-slot=page-heading]]:pb-5',

        // Keep positioned form controls inside the fixed content boundary.
        fixed && 'relative min-h-0 grow overflow-hidden',

        // If layout is not fluid, set the max-width
        !fluid &&
          '@7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl',
        className
      )}
      {...props}
    />
  )
}
