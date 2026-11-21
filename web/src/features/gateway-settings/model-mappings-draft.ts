export function validModelMappingId(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith('__') &&
    new TextEncoder().encode(value).length <= 256 &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
    })
  )
}

export function modelMappingsError(
  value: Record<string, string>
): 'mappingLimit' | 'modelIdError' | undefined {
  const entries = Object.entries(value)
  if (entries.length > 512) return 'mappingLimit'
  if (
    entries.some(
      ([source, target]) =>
        !validModelMappingId(source) || !validModelMappingId(target)
    )
  )
    return 'modelIdError'
}
