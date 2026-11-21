let token = ''
export function setHumanToken(value: string) {
  token = value
}
export function consumeHumanToken() {
  const value = token
  token = ''
  return value
}
export function resetHumanVerification() {
  window.dispatchEvent(new Event('ovload-human-reset'))
}
