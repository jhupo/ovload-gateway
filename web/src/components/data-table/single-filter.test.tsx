import { useState } from 'react'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableSingleFilter } from './single-filter'

const options = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]
function Single() {
  const [value, setValue] = useState('all')
  return (
    <>
      <DataTableSingleFilter
        title='Status'
        value={value}
        onValueChange={setValue}
        options={options}
      />
      <output>{value}</output>
    </>
  )
}
test('single-value filters replace a selection, clear it, close and restore trigger focus', async () => {
  const screen = await render(<Single />)
  const trigger = screen.getByRole('button', { name: 'Status', exact: true })
  await userEvent.click(trigger)
  await userEvent.click(
    screen.getByRole('option', { name: 'Active', exact: true })
  )
  await expect.element(screen.getByRole('status')).toHaveTextContent('active')
  await expect.element(trigger).toHaveFocus()
  await userEvent.click(trigger)
  await userEvent.click(
    screen.getByRole('option', { name: 'Disabled', exact: true })
  )
  await expect.element(screen.getByRole('status')).toHaveTextContent('disabled')
  await userEvent.click(trigger)
  await userEvent.click(
    screen.getByRole('option', { name: 'Clear filters', exact: true })
  )
  await expect.element(screen.getByRole('status')).toHaveTextContent('all')
})
function Multiple() {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <>
      <DataTableFacetedFilter
        title='Statuses'
        selected={selected}
        onSelectedChange={setSelected}
        options={options}
      />
      <output>{selected.join(',')}</output>
    </>
  )
}
test('existing multiple-selection filters keep both selections and remain open', async () => {
  const screen = await render(<Multiple />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Statuses', exact: true })
  )
  await userEvent.click(
    screen.getByRole('option', { name: 'Active', exact: true })
  )
  await userEvent.click(
    screen.getByRole('option', { name: 'Disabled', exact: true })
  )
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('active,disabled')
  await expect
    .element(screen.getByRole('option', { name: 'Active', exact: true }))
    .toBeVisible()
})
