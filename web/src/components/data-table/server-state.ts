import type {
  OnChangeFn,
  PaginationState,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'

export type ServerTableState = {
  pagination: PaginationState
  sorting: SortingState
  onPaginationChange: OnChangeFn<PaginationState>
  onSortingChange: OnChangeFn<SortingState>
  total: number
}

export type ServerFilters = { search: string; columns: ColumnFiltersState }
