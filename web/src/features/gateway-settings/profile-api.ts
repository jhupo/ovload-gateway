import { z } from 'zod'
import { platformRequest } from '@/api/platform-client'
import type { AccountPlatform } from '@/lib/upstream-platforms'

const configuration = z.record(z.string(), z.unknown())
const optionsSchema = z.object({
  globalConfiguration: configuration,
  defaults: configuration.optional(),
  maxVersionLag: z.number().int().nonnegative().optional(),
  presets: z
    .array(
      z.object({
        configuration,
        automaticAvailable: z.boolean(),
        defaults: z.record(z.string(), z.string()).optional(),
      })
    )
    .optional(),
})
const previewSchema = z
  .object({
    configuration,
    userAgent: z.string(),
    versionSource: z.string(),
    error: z.string().nullable().optional(),
  })
  .passthrough()

export type ProfileProvider = AccountPlatform
export type ProfileConfiguration = Record<string, unknown>
export type ProfileOptions = z.infer<typeof optionsSchema>
export type ProfilePreview = z.infer<typeof previewSchema>

export const requestProfileApi = {
  options: async (provider: ProfileProvider, signal?: AbortSignal) =>
    optionsSchema.parse(
      await platformRequest<unknown>(`/settings/client-profiles/${provider}`, {
        signal,
      })
    ),
  preview: async (
    provider: ProfileProvider,
    value: ProfileConfiguration,
    signal?: AbortSignal
  ) =>
    previewSchema.parse(
      await platformRequest<unknown>(
        `/settings/client-profiles/${provider}/preview`,
        {
          method: 'POST',
          body: { configuration: value },
          signal,
        }
      )
    ),
}
