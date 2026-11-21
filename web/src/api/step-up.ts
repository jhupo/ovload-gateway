export type StepUpHandler = () => Promise<void>

let handler: StepUpHandler | undefined

export function installStepUpHandler(next: StepUpHandler): () => void {
  const previous = handler
  handler = next
  return () => {
    if (handler === next) handler = previous
  }
}

export async function ensureStepUp(): Promise<void> {
  if (!handler) throw new Error('Security verification is not available')
  await handler()
}
