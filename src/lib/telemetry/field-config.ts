export interface FieldConfig {
  sessionIdFields: readonly string[]
  userIdFields: readonly string[]
  // Attribute key whose value classifies a trace as a backend job
  // (e.g. "widget", "scheduled", "backend_job"). Set via
  // CUSTOM_SESSION_KIND_FIELD env var — each consumer picks their own key.
  sessionKindField?: string
  // Attribute key indicating an LLM call’s purpose (e.g. "title_generation").
  // Traces where *all* chat spans carry this are classified as "utility".
  // Set via CUSTOM_LLM_PURPOSE_FIELD env var.
  llmPurposeField?: string
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
  const sessionKindField = (process.env.CUSTOM_SESSION_KIND_FIELD ?? '').trim() || undefined
  const llmPurposeField = (process.env.CUSTOM_LLM_PURPOSE_FIELD ?? '').trim() || undefined
  _config =
    sessionIdFields.length || userIdFields.length || sessionKindField || llmPurposeField
      ? { sessionIdFields, userIdFields, sessionKindField, llmPurposeField }
      : EMPTY
  return _config
}
