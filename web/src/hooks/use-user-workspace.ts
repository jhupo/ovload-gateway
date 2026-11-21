import { useLocation } from '@tanstack/react-router'

export function useUserWorkspace() {
  return useLocation({
    select: ({ pathname }) =>
      pathname === '/user' || pathname.startsWith('/user/'),
  })
}
