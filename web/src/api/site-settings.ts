import { z } from 'zod'
import { apiRequest } from './client'

const siteSettingsSchema = z.object({
  timezone: z.string().optional(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string(),
  subtitle: z.string(),
  support: z.string(),
  endpoint: z.string(),
  logo_url: z.string().startsWith('/api/v1/site-settings/logo?').nullable(),
  logo_width: z.number().int().min(1).max(256).nullable(),
  logo_height: z.number().int().min(1).max(256).nullable(),
  updated_at: z.iso.datetime({ offset: true }),
})

export type SiteSettings = z.infer<typeof siteSettingsSchema>
export type SiteSettingsInput = Pick<
  SiteSettings,
  'name' | 'subtitle' | 'support' | 'endpoint'
>

export const siteSettingsApi = {
  publicLoad: async (signal?: AbortSignal): Promise<SiteSettings> =>
    siteSettingsSchema.parse(
      (await apiRequest('customer', '/site-settings', { signal, public: true }))
        .data
    ),
  load: async (signal?: AbortSignal): Promise<SiteSettings> =>
    siteSettingsSchema.parse(
      (await apiRequest('management', '/site-settings', { signal })).data
    ),
  update: async (
    body: SiteSettingsInput,
    revision: number,
    signal?: AbortSignal
  ): Promise<SiteSettings> =>
    siteSettingsSchema.parse(
      (
        await apiRequest('management', '/site-settings', {
          method: 'PATCH',
          body,
          revision,
          signal,
        })
      ).data
    ),
  replaceLogo: async (
    file: File | null,
    revision: number,
    signal?: AbortSignal
  ): Promise<SiteSettings> =>
    siteSettingsSchema.parse(
      (
        await apiRequest('management', '/site-settings/logo', {
          method: file ? 'PUT' : 'DELETE',
          body: file ?? undefined,
          revision,
          signal,
        })
      ).data
    ),
}
