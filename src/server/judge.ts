// In-app LLM judge (Path B). Calls the OpenAI-compatible Responses endpoint
// (PROMPT_LIVE_ENDPOINT) and reads only normalized Span fields, so it scores any
// emitter identically.

import type { JsonValue } from '#/lib/json'
import { estimateCostUsd } from '#/lib/llm-pricing'
import { AgentCallError, callAgent } from './agent-run'

const JUDGE_TIMEOUT_MS = 60_000

export type JudgeDefaults = { endpointUrl: string; model: string; configured: boolean }

export function resolveJudgeDefaults(): JudgeDefaults {
  const endpointUrl = process.env.JUDGE_ENDPOINT ?? process.env.PROMPT_LIVE_ENDPOINT ?? ''
  const model = process.env.JUDGE_MODEL ?? 'gpt-4o-mini'
  return { endpointUrl, model, configured: endpointUrl.length > 0 }
}

// A snapshot of the normalized Span fields the rubric reads.
export type JudgeCaseFields = Record<string, JsonValue>

export type JudgeVerdict = {
  value: number | null
  label: string | null
  explanation: string | null
  errorType: string | null
  costUsd: number
  inputTokens: number | null
  outputTokens: number | null
  raw: string
}

// Aggregated verdict over N samples; per-sample verdicts are kept for calibration.
export type AggregatedVerdict = JudgeVerdict & {
  samples: number
  variance: number | null
  perSample: { value: number | null; label: string | null; errorType: string | null }[]
}

export const MAX_JUDGE_SAMPLES = 5

const DATA_TYPE_INSTRUCTION: Record<string, string> = {
  boolean:
    'Respond with a JSON object {"value": 1 or 0, "explanation": "..."} where 1 = good/correct, 0 = bad/incorrect.',
  categorical: 'Respond with a JSON object {"label": "<one of the allowed categories>", "explanation": "..."}.',
  numeric: 'Respond with a JSON object {"value": <number in the allowed range>, "explanation": "..."}.',
  text: 'Respond with a JSON object {"label": "<short verdict>", "explanation": "..."}.',
}

export function buildJudgeMessages(opts: {
  judgePrompt: string | null
  dataType: string
  categories?: string[] | null
  fields: JudgeCaseFields
  expected?: JsonValue | null
}): { role: string; content: string }[] {
  const rubric = opts.judgePrompt?.trim() || 'Evaluate the quality of the agent behavior described below.'
  const allowed =
    opts.dataType === 'categorical' && opts.categories?.length
      ? `\nAllowed categories: ${opts.categories.join(', ')}.`
      : ''
  const system = [
    rubric,
    allowed,
    `\n${DATA_TYPE_INSTRUCTION[opts.dataType] ?? DATA_TYPE_INSTRUCTION.text}`,
    '\nBe strict and reference-free unless an expected answer is provided. Output ONLY the JSON object.',
  ].join('')

  const caseLines = Object.entries(opts.fields)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `### ${k}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`)
  if (opts.expected != null) {
    caseLines.push(
      `### expected\n${typeof opts.expected === 'string' ? opts.expected : JSON.stringify(opts.expected, null, 2)}`,
    )
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: caseLines.join('\n\n') || '(no fields provided)' },
  ]
}

// First balanced JSON object in the text, respecting string literals/escapes —
// robust to prose or stray braces around the verdict JSON.
function firstJsonObject(text: string): Record<string, unknown> | null {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inStr = false
    let escaped = false
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (inStr) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(i, j + 1))
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return parsed as Record<string, unknown>
            }
          } catch {
            // Not valid JSON starting here — fall through to try the next `{`.
          }
          break
        }
      }
    }
  }
  return null
}

export function parseVerdict(
  text: string,
  dataType: string,
): { value: number | null; label: string | null; explanation: string | null } {
  const obj = firstJsonObject(text)
  if (!obj) {
    // Fallback: a bare label/number in the prose.
    if (dataType === 'numeric' || dataType === 'boolean') {
      const m = text.match(/-?\d+(\.\d+)?/)
      return { value: m ? Number(m[0]) : null, label: null, explanation: text.trim() || null }
    }
    return { value: null, label: text.trim() || null, explanation: null }
  }
  const explanation =
    typeof obj.explanation === 'string' ? obj.explanation : typeof obj.reason === 'string' ? obj.reason : null
  let value: number | null = null
  if (typeof obj.value === 'number') value = obj.value
  else if (typeof obj.score === 'number') value = obj.score
  else if (typeof obj.value === 'boolean') value = obj.value ? 1 : 0
  const label = typeof obj.label === 'string' ? obj.label : typeof obj.verdict === 'string' ? obj.verdict : null
  return { value, label, explanation }
}

// JSON Schema for the verdict, sent as the Responses-API structured-output
// constraint (`text.format`). Providers that ignore it fall through to parseVerdict.
export function buildVerdictSchema(
  dataType: string,
  opts: { categories?: string[] | null; minValue?: number | null; maxValue?: number | null } = {},
): Record<string, unknown> {
  const explanation = { type: 'string' }
  let properties: Record<string, unknown>
  if (dataType === 'categorical') {
    const label: Record<string, unknown> = { type: 'string' }
    if (opts.categories?.length) label.enum = opts.categories
    properties = { label, explanation }
  } else if (dataType === 'text') {
    properties = { label: { type: 'string' }, explanation }
  } else {
    const value: Record<string, unknown> = { type: 'number' }
    if (dataType === 'numeric') {
      if (typeof opts.minValue === 'number') value.minimum = opts.minValue
      if (typeof opts.maxValue === 'number') value.maximum = opts.maxValue
    }
    properties = { value, explanation }
  }
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

export async function runJudge(opts: {
  endpointUrl: string
  model: string
  judgePrompt: string | null
  dataType: string
  categories?: string[] | null
  minValue?: number | null
  maxValue?: number | null
  temperature?: number
  fields: JudgeCaseFields
  expected?: JsonValue | null
}): Promise<JudgeVerdict> {
  const messages = buildJudgeMessages(opts)
  // Opt out where an endpoint 4xxs on an unknown `text.format`; parseVerdict still recovers prose.
  const responseFormat =
    process.env.JUDGE_STRUCTURED_OUTPUT !== '0'
      ? {
          type: 'json_schema',
          name: 'verdict',
          strict: true,
          schema: buildVerdictSchema(opts.dataType, {
            categories: opts.categories,
            minValue: opts.minValue,
            maxValue: opts.maxValue,
          }),
        }
      : undefined

  let result: Awaited<ReturnType<typeof callAgent>>
  try {
    result = await callAgent({
      endpointUrl: opts.endpointUrl,
      model: opts.model,
      input: messages,
      sampling: { temperature: opts.temperature ?? 0 },
      responseFormat,
      timeoutMs: JUDGE_TIMEOUT_MS,
    })
  } catch (err) {
    const noVerdict = (errorType: string, explanation: string | null, raw = '') => ({
      value: null,
      label: null,
      explanation,
      errorType,
      costUsd: 0,
      inputTokens: null,
      outputTokens: null,
      raw,
    })
    if (err instanceof AgentCallError) {
      if (err.errorType === 'http') return noVerdict(`http_${err.status}`, err.message.slice(0, 500), err.message)
      return noVerdict(err.errorType, null)
    }
    return noVerdict('network_error', null)
  }

  const verdict = parseVerdict(result.text, opts.dataType)
  const costUsd =
    estimateCostUsd({
      model: opts.model,
      inputTokens: result.inputTokens ?? undefined,
      outputTokens: result.outputTokens ?? undefined,
    }) ?? 0
  // A 200 with no usable verdict (empty/partial JSON, prose) is a judge failure,
  // not a pass — flag it so it lands in run errors rather than inflating pass rate.
  const hasSignal =
    opts.dataType === 'boolean' || opts.dataType === 'numeric' ? verdict.value != null : verdict.label != null
  return {
    value: verdict.value,
    label: verdict.label,
    explanation: verdict.explanation,
    errorType: hasSignal ? null : 'parse_error',
    costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    raw: result.text,
  }
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let bestN = 0
  for (const [v, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = v
    }
  }
  return best
}

function populationVariance(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
}

// Sampling temperature for multi-sample runs. At 0 the calls are ~deterministic
// and variance is meaningless, so n>1 samples at a non-zero temperature. Env-overridable.
const SAMPLE_TEMPERATURE = (() => {
  const t = Number(process.env.JUDGE_SAMPLE_TEMPERATURE)
  return Number.isFinite(t) && t >= 0 ? t : 0.7
})()

// Sample the judge `samples` times and aggregate: numeric/boolean → mean + variance,
// categorical/text → modal label. Single-shot stays at temperature 0; n>1 raises it.
export async function runJudgeSamples(
  opts: Parameters<typeof runJudge>[0],
  samples: number,
): Promise<AggregatedVerdict> {
  const n = Math.max(1, Math.min(MAX_JUDGE_SAMPLES, Math.trunc(samples) || 1))
  const temperature = opts.temperature ?? (n > 1 ? SAMPLE_TEMPERATURE : 0)
  const results: JudgeVerdict[] = []
  for (let i = 0; i < n; i++) results.push(await runJudge({ ...opts, temperature }))

  const costUsd = results.reduce((a, r) => a + r.costUsd, 0)
  const inputTokens = results.reduce((a, r) => a + (r.inputTokens ?? 0), 0) || null
  const outputTokens = results.reduce((a, r) => a + (r.outputTokens ?? 0), 0) || null
  const perSample = results.map((r) => ({ value: r.value, label: r.label, errorType: r.errorType }))
  const ok = results.filter((r) => !r.errorType)

  if (n === 1) {
    const r = results[0]
    return { ...r, costUsd, samples: 1, variance: null, perSample }
  }

  const values = ok.map((r) => r.value).filter((v): v is number => v != null)
  const labels = ok.map((r) => r.label).filter((l): l is string => l != null)
  const value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  const label = mode(labels)
  const explanation = ok.find((r) => r.explanation)?.explanation ?? null
  const errorType = ok.length === 0 ? (results[0]?.errorType ?? 'all_samples_failed') : null

  return {
    value,
    label,
    explanation,
    errorType,
    costUsd,
    inputTokens,
    outputTokens,
    raw: results.map((r) => r.raw).join('\n---\n'),
    samples: n,
    variance: populationVariance(values),
    perSample,
  }
}
