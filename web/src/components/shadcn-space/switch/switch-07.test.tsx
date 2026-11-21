import { useState } from 'react'
import '@/styles/index.css'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { SwitchLabeled } from './switch-07'

describe('SwitchLabeled', () => {
  it.each([
    ['开', '关'],
    ['On', 'Off'],
  ])(
    'defaults to the compact size with stable %s/%s labels',
    async (onLabel, offLabel) => {
      const view = await render(
        <>
          <div className='text-sm'>
            <SwitchLabeled
              id='default-size'
              aria-label='Default size'
              onLabel={onLabel}
              offLabel={offLabel}
            />
          </div>
          <SwitchLabeled
            id='small-size'
            aria-label='Small size'
            size='sm'
            onLabel={onLabel}
            offLabel={offLabel}
          />
        </>
      )
      const root = document.getElementById('default-size')!
      const small = document.getElementById('small-size')!
      const initial = root.getBoundingClientRect()
      expect(initial.height).toBe(24)
      expect(initial.width).toBe(small.getBoundingClientRect().width)
      expect(
        root.querySelector('span[data-state]')!.getBoundingClientRect().height
      ).toBe(16)
      await userEvent.click(view.getByRole('switch', { name: 'Default size' }))
      await expect
        .element(view.getByRole('switch', { name: 'Default size' }))
        .toBeChecked()
      expect(root.getBoundingClientRect().width).toBe(initial.width)
      expect(root.getBoundingClientRect().height).toBe(initial.height)
    }
  )

  it('supports native label activation and keyboard interaction', async () => {
    const change = vi.fn()
    const view = await render(
      <>
        <label htmlFor='feature-switch'>Feature</label>
        <SwitchLabeled id='feature-switch' onCheckedChange={change} />
      </>
    )
    const control = view.getByRole('switch', { name: 'Feature' })
    await userEvent.click(view.getByText('Feature', { exact: true }))
    await expect.element(control).toBeChecked()
    await userEvent.keyboard(' ')
    await expect.element(control).not.toBeChecked()
    expect(change.mock.calls).toEqual([[true], [false]])
  })

  it('preserves controlled values and disabled behavior', async () => {
    function Controlled() {
      const [checked, setChecked] = useState(false)
      return (
        <SwitchLabeled
          aria-label='Controlled'
          checked={checked}
          onCheckedChange={setChecked}
        />
      )
    }
    const view = await render(
      <>
        <Controlled />
        <SwitchLabeled aria-label='Disabled' disabled defaultChecked />
      </>
    )
    await userEvent.click(view.getByRole('switch', { name: 'Controlled' }))
    await expect
      .element(view.getByRole('switch', { name: 'Controlled' }))
      .toBeChecked()
    await expect
      .element(view.getByRole('switch', { name: 'Disabled' }))
      .toBeDisabled()
    await expect
      .element(view.getByRole('switch', { name: 'Disabled' }))
      .toBeChecked()
  })

  it('contributes its checked value to native form data', async () => {
    const view = await render(
      <form data-testid='switch-form'>
        <SwitchLabeled
          name='alerts'
          value='enabled'
          defaultChecked
          aria-label='Alerts'
        />
      </form>
    )
    const form = document.querySelector<HTMLFormElement>(
      '[data-testid="switch-form"]'
    )!
    expect(new FormData(form).get('alerts')).toBe('enabled')
    await userEvent.click(view.getByRole('switch', { name: 'Alerts' }))
    expect(new FormData(form).get('alerts')).toBeNull()
  })

  it('keeps the native input inside a scrolling form without overflowing its ancestor', async () => {
    await render(
      <div
        data-testid='switch-boundary'
        style={{ position: 'relative', height: 120, width: 300 }}
      >
        <div
          data-testid='switch-scroll'
          style={{ height: '100%', overflowY: 'auto' }}
        >
          <form style={{ height: 400, paddingTop: 300 }}>
            <SwitchLabeled name='alerts' aria-label='Scrolling alerts' />
          </form>
        </div>
      </div>
    )
    const boundary = document.querySelector<HTMLElement>(
      '[data-testid="switch-boundary"]'
    )!
    const scroll = document.querySelector<HTMLElement>(
      '[data-testid="switch-scroll"]'
    )!
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
    expect(boundary.scrollHeight).toBe(boundary.clientHeight)
  })
})
