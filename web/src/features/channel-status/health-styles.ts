export const healthStyles = {
  healthy: {
    badge:
      'border-transparent bg-[var(--badge-success)] text-[var(--badge-success-foreground)]',
    bar: 'bg-[var(--badge-success-foreground)]',
  },
  warning: {
    badge:
      'border-transparent bg-[var(--badge-warning)] text-[var(--badge-warning-foreground)]',
    bar: 'bg-[var(--badge-warning-foreground)]',
  },
  critical: {
    badge:
      'border-transparent bg-[var(--badge-danger)] text-[var(--badge-danger-foreground)]',
    bar: 'bg-[var(--badge-danger-foreground)]',
  },
  insufficient: {
    badge:
      'border-transparent bg-[var(--badge-info)] text-[var(--badge-info-foreground)]',
    bar: 'bg-[var(--badge-info-foreground)]/40',
  },
  paused: {
    badge:
      'border-transparent bg-[var(--badge-neutral)] text-[var(--badge-neutral-foreground)]',
    bar: 'bg-muted-foreground/30',
  },
  unavailable: {
    badge:
      'border-transparent bg-[var(--badge-neutral)] text-[var(--badge-neutral-foreground)]',
    bar: 'bg-muted-foreground/30',
  },
}
export type ChannelHealth = keyof typeof healthStyles
