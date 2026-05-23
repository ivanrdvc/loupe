export interface FieldConfig {
  sessionIdFields: readonly string[]
  userIdFields: readonly string[]
  // Attribute key indicating an LLM call’s purpose (e.g. "title_generation").
  // Traces where *all* chat spans carry this are classified as "utility".
  // Set via CUSTOM_LLM_PURPOSE_FIELD env var.
  llmPurposeField?: string
}

// Dotted OTel attribute keys are allowed; call sites quote for AI and flatten for OO.
const IDENT = /^[A-Za-z0-9_.]+$/
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
    llmPurposeField: ident(process.env.CUSTOM_LLM_PURPOSE_FIELD),
  }
  return _config
}
