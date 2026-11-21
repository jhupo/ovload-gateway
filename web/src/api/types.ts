export type Audience = 'customer' | 'management'

export type IdentitySession = {
  id: string
  audience: Audience
  tenant_id: string | null
  user_id: string | null
  principal_id: string | null
  expires_at: string
  csrf_token?: string
}

export type CustomerProfile = {
  id: string
  tenant_id: string
  email: string
  display_name: string
  status: 'active' | 'suspended' | 'revoked'
  revision: number
  created_at: string
  updated_at: string
  max_concurrency: number
  requests_per_minute: number
  customer_max_concurrency: number
  customer_requests_per_minute: number
  email_verified_at: string | null
}

export type ManagementProfile = {
  id: string
  username: string
  status: 'active' | 'suspended' | 'revoked'
  revision: number
  created_at: string
  updated_at: string
}

export type PermissionGrant = {
  id: string
  principal_id: string
  scope: 'platform' | 'tenant'
  tenant_id: string | null
  permissions: string[]
  status: string
  expires_at: string | null
  revision: number
  created_at: string
  updated_at: string
}

export type RegistrationPolicy = {
  revision: number
  agreement: {
    enabled: boolean
    mode: 'modal' | 'checkbox'
    updated: string
    documents: { id: string; title: string; slug: string; content: string }[]
  }
  registration_enabled: boolean
  verification_required: boolean
  recovery_enabled: boolean
  oauth_providers: string[]
  oauth_available: string[]
}

export type Page<T> = { items: T[]; next_cursor: string | null }
