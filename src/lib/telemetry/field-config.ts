export interface FieldConfig {
  sessionIdFields: readonly string[]
  userIdFields: readonly string[]
}

const EMPTY: FieldConfig = { sessionIdFields: [], userIdFields: [] }

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// Read once at module load — env vars don't change at runtime.
let _config: FieldConfig | undefined

export function readFieldConfig(): FieldConfig {
  if (_config) return _config
  const sessionIdFields = parseList(process.env.CUSTOM_SESSION_ID_FIELDS)
  const userIdFields = parseList(process.env.CUSTOM_USER_ID_FIELDS)
  _config = sessionIdFields.length || userIdFields.length ? { sessionIdFields, userIdFields } : EMPTY
  return _config
}
