export function retailMultiplierText(bps: number): string {
  const whole = Math.floor(bps / 10000)
  const fraction = String(bps % 10000)
    .padStart(4, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}
