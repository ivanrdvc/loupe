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
