import type { IdentitySession } from './types'

export type SessionPort = {
  getSession: () => IdentitySession | null
  invalidateSession: (expectedId: string | undefined) => boolean
}

const emptyPort: SessionPort = {
  getSession: () => null,
  invalidateSession: () => false,
}

let port: SessionPort = emptyPort

export function installSessionPort(next: SessionPort): () => void {
  const previous = port
  port = next
  return () => {
    if (port === next) port = previous
  }
}

export function sessionPort(): SessionPort {
  return port
}
