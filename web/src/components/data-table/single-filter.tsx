import { DataTableFacetedFilter } from './faceted-filter'

// Adapt existing single-value/URL filters to the shared table filter primitive.
export function DataTableSingleFilter({
  title,
  value,
  onValueChange,
  options,
}: {
  title: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <DataTableFacetedFilter
      title={title}
      options={options.filter((option) => option.value !== 'all')}
      selected={value === 'all' ? [] : [value]}
      onSelectedChange={(values) => onValueChange(values[0] ?? 'all')}
      selectionMode='single'
    />
  )
}
