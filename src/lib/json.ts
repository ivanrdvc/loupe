// JSON-serializable value. Used wherever a Span field crosses a server-
// function boundary — TanStack Start's serialization guard rejects `unknown`,
// so we declare JSON-shaped values explicitly.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// Try-parse: returns parsed JSON on success, undefined on failure or non-string
// input. JSON.parse is typed `any` in the stdlib; assigning to `JsonValue` here
// is structurally correct — JSON.parse can only produce JSON-shaped output.
export function parseJson(v: unknown): JsonValue | undefined {
  if (typeof v !== 'string' || !v) return undefined
  try {
    return JSON.parse(v)
  } catch {
    return undefined
  }
}

// Some producers (e.g. OpenLLMetry tool results) emit several JSON values
// concatenated/newline-delimited instead of one document. Returns the values
// as an array, or undefined unless the whole string is ≥2 valid JSON values.
export function parseJsonConcat(v: unknown): JsonValue[] | undefined {
  if (typeof v !== 'string') return undefined
  const values: JsonValue[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (esc) {
      esc = false
      continue
    }
    if (inStr) {
      if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (depth === 0) {
      if (c === '{' || c === '[') {
        start = i
        depth = 1
      } else if (!/\s/.test(c)) return undefined
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) {
        const parsed = parseJson(v.slice(start, i + 1))
        if (parsed === undefined) return undefined
        values.push(parsed)
      }
    }
  }
  if (depth !== 0 || values.length < 2) return undefined
  return values
}

// Circular refs become `[Circular]` instead of throwing.
export function formatJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    const seen = new WeakSet<object>()
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        return v
      },
      2,
    )
  } catch {
    return String(value)
  }
}

export function looksLikeJson(v: string): boolean {
  const t = v.trimStart()
  return t.startsWith('{') || t.startsWith('[')
}

// Like formatJson, but unwraps a JSON-encoded string into its parsed value.
export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = parseJson(value)
    if (parsed !== null && typeof parsed === 'object') return formatJson(parsed)
    return value
  }
  return formatJson(value)
}
