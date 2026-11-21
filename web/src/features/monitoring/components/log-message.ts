/** Operational events may wrap the human message in a structured envelope. */
export function logMessage(raw: string): string {
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'message' in value &&
      typeof value.message === 'string' &&
      value.message.trim()
    )
      return value.message
  } catch {
    /* Plain-text messages are already ready for display. */
  }
  return raw
}
