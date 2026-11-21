import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { NumberTicker } from './number-ticker-01'

it('formats the value and reaches the final value after animation', async () => {
  const view = await render(
    <NumberTicker
      data-testid='ticker'
      value={1234.5}
      duration={0.05}
      locale='en-US'
      formatOptions={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
      suffix=' TPS'
    />
  )

  const ticker = view.getByTestId('ticker')
  await expect.element(ticker).toHaveAttribute('aria-label', '1,234.5 TPS')
  await expect.poll(() => ticker.element().textContent).toBe('1,234.5 TPS')

  await view.rerender(
    <NumberTicker
      data-testid='ticker'
      value={2500}
      duration={0}
      locale='en-US'
      suffix=' TPS'
    />
  )
  await expect.element(ticker).toHaveTextContent('2,500 TPS')
})
