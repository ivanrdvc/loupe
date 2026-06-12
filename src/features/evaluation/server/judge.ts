// In-app LLM judge (Path B). Calls the model through the Vercel AI SDK with a
// BYO key from env (OPENAI_API_KEY / ANTHROPIC_API_KEY / AZURE_OPENAI_API_KEY),
// reading only normalized Span fields so it scores any emitter identically.
// Provider routing is `judgeModelProvider`'s registry lookup (azure/* prefixed
// deployments → Azure OpenAI, unknown ids → OpenAI).

import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createOpenAI } from '@ai-sdk/openai'
import { APICallError, generateObject, generateText, jsonSchema, type LanguageModel, NoObjectGeneratedError } from 'ai'
import { DEFAULT_JUDGE_MODEL, type JudgeProvider, judgeModelProvider } from '#/features/evaluation/logic/models'
import type { JsonValue } from '#/lib/json'
import { estimateCostUsd } from '#/lib/spans/llm-pricing'

const JUDGE_TIMEOUT_MS = 60_000

export type JudgeDefaults = {
  model: string
  provider: JudgeProvider
  configured: boolean
  hasOpenAIKey: boolean
  hasAnthropicKey: boolean
  hasAzureKey: boolean
}

export function resolveJudgeDefaults(): JudgeDefaults {
  const model = process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY)
  const hasAzureKey = Boolean(process.env.AZURE_OPENAI_API_KEY)
  const provider: JudgeProvider = judgeModelProvider(model)
  return {
    model,
    provider,
    configured: hasOpenAIKey || hasAnthropicKey || hasAzureKey || process.env.JUDGE_PROVIDER === 'fixtures',
    hasOpenAIKey,
    hasAnthropicKey,
    hasAzureKey,
  }
}

function modelFor(model: string): LanguageModel {
  const provider = judgeModelProvider(model)
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY to use a Claude judge model.')
    return createAnthropic({ apiKey })(model)
  }
  if (provider === 'azure') {
    const apiKey = process.env.AZURE_OPENAI_API_KEY
    if (!apiKey) throw new Error('Set AZURE_OPENAI_API_KEY to use an Azure OpenAI judge model.')
    const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME
    const baseURL = process.env.AZURE_OPENAI_ENDPOINT
    if (!resourceName && !baseURL) {
      throw new Error('Set AZURE_OPENAI_RESOURCE_NAME (or AZURE_OPENAI_ENDPOINT) to use an Azure OpenAI judge model.')
    }
    const azure = createAzure({
      apiKey,
      resourceName,
      baseURL,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    })
    return azure.responses(model.replace(/^azure\//i, ''))
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Set OPENAI_API_KEY to use an OpenAI judge model.')
  return createOpenAI({ apiKey }).responses(model)
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

function buildJudgeMessages(opts: {
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

// Deterministic judge for the e2e suite (JUDGE_PROVIDER=fixtures). Always passes.
function fixturesVerdict(opts: {
  dataType: string
  categories?: string[] | null
  maxValue?: number | null
}): JudgeVerdict {
  const base = {
    explanation: 'fixtures judge: pass',
    errorType: null,
    costUsd: 0,
    inputTokens: 10,
    outputTokens: 5,
    raw: '{"fixtures":true}',
  }
  if (opts.dataType === 'boolean') return { value: 1, label: null, ...base }
  if (opts.dataType === 'numeric') return { value: opts.maxValue ?? 1, label: null, ...base }
  if (opts.dataType === 'categorical') return { value: null, label: opts.categories?.[0] ?? 'pass', ...base }
  return { value: null, label: 'pass', ...base }
}

export async function runJudge(opts: {
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
  if (process.env.JUDGE_PROVIDER === 'fixtures') return fixturesVerdict(opts)
  const [sys, usr] = buildJudgeMessages(opts)
  const temperature = opts.temperature ?? 0
  const noVerdict = (errorType: string, explanation: string | null, raw = ''): JudgeVerdict => ({
    value: null,
    label: null,
    explanation,
    errorType,
    costUsd: 0,
    inputTokens: null,
    outputTokens: null,
    raw,
  })

  let model: LanguageModel
  try {
    model = modelFor(opts.model)
  } catch (err) {
    return noVerdict('config_error', err instanceof Error ? err.message : null)
  }

  let parsed: { value: number | null; label: string | null; explanation: string | null } | null = null
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let raw = ''
  // Opt out of structured output where a model rejects json_schema;
  // generateText + parseVerdict still recovers a verdict from prose.
  const structured = process.env.JUDGE_STRUCTURED_OUTPUT !== '0'

  try {
    if (structured) {
      const { object, usage } = await generateObject({
        model,
        schema: jsonSchema(
          buildVerdictSchema(opts.dataType, {
            categories: opts.categories,
            minValue: opts.minValue,
            maxValue: opts.maxValue,
          }),
        ),
        system: sys.content,
        prompt: usr.content,
        temperature,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
      })
      raw = JSON.stringify(object)
      parsed = parseVerdict(raw, opts.dataType)
      inputTokens = usage?.inputTokens ?? null
      outputTokens = usage?.outputTokens ?? null
    } else {
      const { text, usage } = await generateText({
        model,
        system: sys.content,
        prompt: usr.content,
        temperature,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
      })
      raw = text
      parsed = parseVerdict(text, opts.dataType)
      inputTokens = usage?.inputTokens ?? null
      outputTokens = usage?.outputTokens ?? null
    }
  } catch (err) {
    // A model that emits prose instead of the schema still carries a verdict — salvage it.
    if (NoObjectGeneratedError.isInstance(err) && typeof err.text === 'string') {
      parsed = parseVerdict(err.text, opts.dataType)
      raw = err.text
      inputTokens = err.usage?.inputTokens ?? null
      outputTokens = err.usage?.outputTokens ?? null
    } else if (APICallError.isInstance(err)) {
      const status = err.statusCode
      return noVerdict(
        status ? `http_${status}` : 'network_error',
        (err.message ?? '').slice(0, 500),
        err.message ?? '',
      )
    } else if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return noVerdict('timeout', null)
    } else {
      return noVerdict('network_error', err instanceof Error ? err.message : null)
    }
  }

  if (!parsed) return noVerdict('parse_error', null, raw)
  const costUsd =
    estimateCostUsd({
      model: opts.model.replace(/^azure\//i, ''),
      inputTokens: inputTokens ?? undefined,
      outputTokens: outputTokens ?? undefined,
    }) ?? 0
  // A response with no usable verdict (empty/partial JSON, prose) is a judge failure,
  // not a pass — flag it so it lands in run errors rather than inflating pass rate.
  const hasSignal =
    opts.dataType === 'boolean' || opts.dataType === 'numeric' ? parsed.value != null : parsed.label != null
  return {
    value: parsed.value,
    label: parsed.label,
    explanation: parsed.explanation,
    errorType: hasSignal ? null : 'parse_error',
    costUsd,
    inputTokens,
    outputTokens,
    raw,
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
