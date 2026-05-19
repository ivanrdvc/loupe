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

// Values land in provider SQL/KQL unquoted, so reject non-identifier chars.
const IDENT = /^[A-Za-z0-9_]+$/
const ident = (raw?: string) => {
  const v = raw?.trim()
  return v && IDENT.test(v) ? v : undefined
}
const parseList = (raw?: string) =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => IDENT.test(s))

let _config: FieldConfig | undefined

export function readFieldConfig(): FieldConfig {
  _config ??= {
    sessionIdFields: parseList(process.env.CUSTOM_SESSION_ID_FIELDS),
    userIdFields: parseList(process.env.CUSTOM_USER_ID_FIELDS),
    sessionKindField: ident(process.env.CUSTOM_SESSION_KIND_FIELD),
    llmPurposeField: ident(process.env.CUSTOM_LLM_PURPOSE_FIELD),
  }
  return _config
}
