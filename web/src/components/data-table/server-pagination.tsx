import { DataTablePaginationControls } from './pagination'
import type { ServerTableState } from './server-state'

export function ServerPagination({ state }: { state: ServerTableState }) {
  return (
    <DataTablePaginationControls
      pageIndex={state.pagination.pageIndex}
      pageSize={state.pagination.pageSize}
      pageCount={Math.ceil(state.total / state.pagination.pageSize)}
      onPageChange={(pageIndex) =>
        state.onPaginationChange((p) => ({ ...p, pageIndex }))
      }
      onPageSizeChange={(pageSize) =>
        state.onPaginationChange({ pageIndex: 0, pageSize })
      }
    />
  )
}
