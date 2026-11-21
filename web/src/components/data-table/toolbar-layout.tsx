import { type ReactNode } from 'react'

/** Shared by client-filtered and server-filtered tables alike. */
export function DataTableToolbarLayout({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      data-slot='table-toolbar'
      className='flex min-w-0 shrink-0 flex-wrap items-start gap-2'
    >
      <div
        data-slot='table-filters'
        className='flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-2'
      >
        {children}
      </div>
      {actions && (
        <div
          data-slot='table-actions'
          className='ms-auto flex shrink-0 flex-wrap items-center justify-end gap-2'
        >
          {actions}
        </div>
      )}
    </div>
  )
}
