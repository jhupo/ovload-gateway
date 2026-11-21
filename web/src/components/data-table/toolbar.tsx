import { type ReactNode } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableToolbarLayout } from './toolbar-layout'
import { DataTableViewOptions } from './view-options'

type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  searchKey?: string
  actions?: ReactNode
  filters?: {
    columnId: string
    title: string
    disabled?: boolean
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
}

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder,
  searchKey,
  actions,
  filters = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter
  const { t } = useTranslation()

  const placeholder = searchPlaceholder ?? t('data_table.filter')

  return (
    <DataTableToolbarLayout
      actions={
        <>
          {actions}
          <DataTableViewOptions table={table} />
        </>
      }
    >
      {searchKey ? (
        <Input
          aria-label={placeholder}
          placeholder={placeholder}
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn(searchKey)?.setFilterValue(event.target.value)
          }
          className='h-8 w-full sm:w-62.5'
        />
      ) : (
        <Input
          aria-label={placeholder}
          placeholder={placeholder}
          value={table.getState().globalFilter ?? ''}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          className='h-8 w-full sm:w-62.5'
        />
      )}
      <div className='flex flex-wrap items-center gap-2'>
        {filters.map((filter) => {
          const column = table.getColumn(filter.columnId)
          if (!column) return null
          return (
            <fieldset
              key={filter.columnId}
              disabled={filter.disabled}
              className='contents'
            >
              <DataTableFacetedFilter
                column={column}
                title={filter.title}
                options={filter.options}
              />
            </fieldset>
          )
        })}
      </div>
      {isFiltered && (
        <Button
          type='button'
          variant='ghost'
          onClick={() => {
            table.resetColumnFilters()
            table.setGlobalFilter('')
          }}
          className='h-8 px-2 lg:px-3'
        >
          {t('data_table.reset')}
          <Cross2Icon className='ms-2 h-4 w-4' />
        </Button>
      )}
    </DataTableToolbarLayout>
  )
}
