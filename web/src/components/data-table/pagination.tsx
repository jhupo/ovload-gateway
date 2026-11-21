import { type ReactNode } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { cn, getPageNumbers } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  className?: string
  actions?: ReactNode
}

export function DataTablePagination<TData>({
  table,
  className,
  actions,
}: DataTablePaginationProps<TData>) {
  return (
    <DataTablePaginationControls
      pageIndex={table.getState().pagination.pageIndex}
      pageSize={table.getState().pagination.pageSize}
      pageCount={table.getPageCount()}
      onPageChange={(page) => table.setPageIndex(page)}
      onPageSizeChange={(size) => table.setPageSize(size)}
      className={className}
      actions={actions}
    />
  )
}

export function DataTablePaginationControls({
  pageIndex,
  pageSize,
  pageCount,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  className,
  actions,
}: {
  pageIndex: number
  pageSize: number
  pageCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  disabled?: boolean
  className?: string
  actions?: ReactNode
}) {
  const currentPage = pageIndex + 1
  const totalPages = Math.max(1, pageCount)
  const pageNumbers = getPageNumbers(currentPage, totalPages)
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex items-center justify-between overflow-clip px-2',
        '@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4',
        actions && 'flex-wrap gap-3',
        className
      )}
      style={{ overflowClipMargin: 1 }}
    >
      <div
        className={cn(
          'flex w-full items-center justify-between',
          actions && '@2xl/content:w-auto'
        )}
      >
        <div className='flex items-center justify-center text-sm font-medium text-nowrap @2xl/content:hidden'>
          {t('data_table.page_of', { current: currentPage, total: totalPages })}
        </div>
        <div className='flex items-center gap-2 @max-2xl/content:flex-row-reverse'>
          <Select
            disabled={disabled}
            value={`${pageSize}`}
            onValueChange={(value) => {
              onPageSizeChange(Number(value))
            }}
          >
            <SelectTrigger
              className='h-8 w-17.5'
              aria-label={t('data_table.rows_per_page')}
            >
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side='top'>
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='hidden text-sm font-medium sm:block'>
            {t('data_table.rows_per_page')}
          </p>
        </div>
      </div>

      {actions && (
        <div className='flex justify-center @2xl/content:flex-1'>{actions}</div>
      )}
      <div className='flex items-center sm:space-x-6 lg:space-x-8'>
        <div className='flex items-center justify-center text-sm font-medium text-nowrap @max-3xl/content:hidden'>
          {t('data_table.page_of', { current: currentPage, total: totalPages })}
        </div>
        <div className='flex items-center space-x-2'>
          <Button
            variant='outline'
            size='icon-sm'
            className='@max-md/content:hidden'
            onClick={() => onPageChange(0)}
            disabled={disabled || pageIndex <= 0}
          >
            <span className='sr-only'>{t('data_table.first_page')}</span>
            <DoubleArrowLeftIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            onClick={() => onPageChange(pageIndex - 1)}
            disabled={disabled || pageIndex <= 0}
          >
            <span className='sr-only'>{t('data_table.previous_page')}</span>
            <ChevronLeftIcon className='h-4 w-4' />
          </Button>

          {/* Page number buttons */}
          {pageNumbers.map((pageNumber, index) => (
            <div key={`${pageNumber}-${index}`} className='flex items-center'>
              {pageNumber === '...' ? (
                <span className='px-1 text-sm text-muted-foreground'>...</span>
              ) : (
                <Button
                  disabled={disabled}
                  variant={currentPage === pageNumber ? 'default' : 'outline'}
                  size='sm'
                  className='min-w-8'
                  onClick={() => onPageChange((pageNumber as number) - 1)}
                >
                  <span className='sr-only'>
                    {t('data_table.go_to_page', { page: pageNumber })}
                  </span>
                  {pageNumber}
                </Button>
              )}
            </div>
          ))}

          <Button
            variant='outline'
            size='icon-sm'
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={disabled || pageIndex >= totalPages - 1}
          >
            <span className='sr-only'>{t('data_table.next_page')}</span>
            <ChevronRightIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            className='@max-md/content:hidden'
            onClick={() => onPageChange(totalPages - 1)}
            disabled={disabled || pageIndex >= totalPages - 1}
          >
            <span className='sr-only'>{t('data_table.last_page')}</span>
            <DoubleArrowRightIcon className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  )
}
