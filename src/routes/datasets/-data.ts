// Mock fixtures for the datasets feature (UI-only, no backend yet).
// Shapes mirror docs/plans/datasets.md so swapping to real server fns is mechanical.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
}

// An example's input is either a single user string or a multi-turn transcript.
export type ExampleInput = string | ChatMessage[]

export interface DatasetExample {
  id: string
  datasetId: string
  input: ExampleInput
  expected: string | null
  metadata: Record<string, string>
  sourceTraceId: string | null
}

/** Single-line preview of an example input (last user turn for transcripts). */
export function inputPreview(input: ExampleInput): string {
  if (typeof input === 'string') return input
  const lastUser = [...input].reverse().find((m) => m.role === 'user')
  return (lastUser ?? input[input.length - 1])?.content ?? ''
}

export function inputTurns(input: ExampleInput): ChatMessage[] | null {
  return typeof input === 'string' ? null : input
}

export type RunItemStatus = 'ok' | 'changed' | 'error' | 'pending'

export interface DatasetRunItem {
  runId: string
  exampleId: string
  output: string
  status: RunItemStatus
  latencyMs: number
  tokens: number
  traceId: string | null
  pass: boolean | null // mocked score
}

export interface DatasetRun {
  id: string
  datasetId: string
  label: string // auto-label, time-based
  createdAt: string
  passRate: number | null // mocked score summary 0..1
}

export interface Dataset {
  id: string
  name: string
  description: string | null
  tags: string[]
  updatedAt: string
  lastRunAt: string | null
  version: string // timestamp label, one version at a time
  endpointOverride: string | null
}

export interface DatasetDetail {
  dataset: Dataset
  examples: DatasetExample[]
  runs: DatasetRun[]
  items: DatasetRunItem[]
}

export const GLOBAL_DEFAULT_ENDPOINT = 'http://localhost:8000/v1/responses'

export const DATASETS: Dataset[] = [
  {
    id: 'ds_reg',
    name: 'Regression set',
    description: 'Questions the support agent has gotten wrong before. Re-run before every deploy.',
    tags: ['regression'],
    updatedAt: 'May 30, 2026',
    lastRunAt: '2h ago',
    version: 'May 30 21:04',
    endpointOverride: null,
  },
  {
    id: 'ds_qa',
    name: 'QA · checkout flow',
    description: 'QA-owned cases covering the billing and checkout paths.',
    tags: ['qa', 'billing'],
    updatedAt: 'May 29, 2026',
    lastRunAt: 'yesterday',
    version: 'May 29 17:10',
    endpointOverride: 'http://localhost:8000/v1/responses',
  },
  {
    id: 'ds_refund',
    name: 'Refund edge cases',
    description: 'Ambiguous and adversarial refund questions. Not run yet.',
    tags: ['qa'],
    updatedAt: 'May 28, 2026',
    lastRunAt: null,
    version: 'May 28 09:22',
    endpointOverride: null,
  },
]

const REG_EXAMPLES: DatasetExample[] = [
  {
    id: 'ex_1',
    datasetId: 'ds_reg',
    input: 'How do refunds work?',
    expected: 'Refunds are available within 30 days of purchase.',
    metadata: { source: 'trace', topic: 'billing' },
    sourceTraceId: '7984d185-3352-f3e1',
  },
  {
    id: 'ex_2',
    datasetId: 'ds_reg',
    input: 'How do I cancel my plan?',
    expected: 'Self-serve in Settings → Billing → Cancel.',
    metadata: { source: 'qa', topic: 'account' },
    sourceTraceId: null,
  },
  {
    id: 'ex_3',
    datasetId: 'ds_reg',
    input: 'I forgot my password, what now?',
    expected: 'Use the reset link emailed to your address.',
    metadata: { source: 'trace', topic: 'auth' },
    sourceTraceId: 'a13c9f02-77de-41bd',
  },
  {
    id: 'ex_4',
    datasetId: 'ds_reg',
    input: 'Do you offer student discounts?',
    expected: null,
    metadata: { source: 'trace', topic: 'pricing' },
    sourceTraceId: '55de2a18-0c4b-49aa',
  },
  {
    id: 'ex_5',
    datasetId: 'ds_reg',
    input: 'Can I export my data?',
    expected: 'Yes — Settings → Data → Export as CSV or JSON.',
    metadata: { source: 'qa', topic: 'data' },
    sourceTraceId: null,
  },
  {
    id: 'ex_6',
    datasetId: 'ds_reg',
    // multi-turn input — tests tool selection, not a fixed string
    input: [
      { role: 'user', content: 'schedule a task to run each Monday at 8am' },
      { role: 'assistant', content: 'Which timezone should I use?' },
      { role: 'user', content: 'UTC' },
    ],
    expected: 'Calls schedule_task with a Monday 08:00 UTC cron (0 8 * * 1).',
    metadata: { source: 'qa', topic: 'scheduling', kind: 'tool-call' },
    sourceTraceId: null,
  },
]

const REG_RUNS: DatasetRun[] = [
  { id: 'run_c', datasetId: 'ds_reg', label: 'run · 21:04', createdAt: '2h ago', passRate: 0.92 },
  { id: 'run_b', datasetId: 'ds_reg', label: 'run · 19:30', createdAt: '4h ago', passRate: 0.88 },
  { id: 'run_a', datasetId: 'ds_reg', label: 'run · 14:00', createdAt: 'yesterday', passRate: 0.75 },
]

function item(
  runId: string,
  exampleId: string,
  output: string,
  status: RunItemStatus,
  pass: boolean | null,
  latencyMs = 820,
  tokens = 142,
  traceId: string | null = 'b2c3d4e5-1a2b',
): DatasetRunItem {
  return { runId, exampleId, output, status, pass, latencyMs, tokens, traceId }
}

const REG_ITEMS: DatasetRunItem[] = [
  // run_c (latest)
  item('run_c', 'ex_1', 'You can request a refund within 30 days of your purchase.', 'ok', true),
  item('run_c', 'ex_2', 'Go to Settings → Billing → Cancel plan.', 'ok', true),
  item('run_c', 'ex_3', 'Click the reset link in the email we sent you.', 'ok', true),
  item('run_c', 'ex_4', "We don't currently advertise a student discount.", 'changed', false),
  item('run_c', 'ex_5', 'Yes — head to Settings → Data → Export.', 'ok', true),
  item(
    'run_c',
    'ex_6',
    'Scheduled ✅ — runs every Monday 08:00 UTC. [tool: schedule_task(cron="0 8 * * 1")]',
    'ok',
    true,
  ),
  // run_b
  item('run_b', 'ex_1', 'You can request a refund within 30 days of your purchase.', 'ok', true),
  item('run_b', 'ex_2', 'Email support@ to cancel your plan.', 'changed', false),
  item('run_b', 'ex_3', 'Click the reset link in the email we sent you.', 'ok', true),
  item('run_b', 'ex_4', 'Please contact sales about discounts.', 'ok', true),
  item('run_b', 'ex_5', 'Yes — head to Settings → Data → Export.', 'ok', true),
  item('run_b', 'ex_6', 'Done — I set up a weekly task. [tool: schedule_task(cron="0 8 * * 0")]', 'changed', false),
  // run_a
  item('run_a', 'ex_1', 'Refunds depend on your plan.', 'error', false),
  item('run_a', 'ex_2', 'Go to Settings → Billing → Cancel plan.', 'ok', true),
  item('run_a', 'ex_3', 'Reset it from the login page.', 'ok', true),
  item('run_a', 'ex_4', 'Please contact sales about discounts.', 'ok', true),
  item('run_a', 'ex_5', 'CSV export is available on paid plans.', 'ok', true),
]

const DETAILS: Record<string, DatasetDetail> = {
  ds_reg: {
    dataset: DATASETS[0],
    examples: REG_EXAMPLES,
    runs: REG_RUNS,
    items: REG_ITEMS,
  },
  ds_qa: {
    dataset: DATASETS[1],
    examples: [
      {
        id: 'qa_1',
        datasetId: 'ds_qa',
        input: 'Add a coupon at checkout',
        expected: 'Coupon field appears on the payment step.',
        metadata: { source: 'qa' },
        sourceTraceId: null,
      },
      {
        id: 'qa_2',
        datasetId: 'ds_qa',
        input: 'Decline then retry a card',
        expected: 'Retry succeeds without losing the cart.',
        metadata: { source: 'qa' },
        sourceTraceId: null,
      },
    ],
    runs: [{ id: 'qa_run_a', datasetId: 'ds_qa', label: 'run · yest', createdAt: 'yesterday', passRate: 0.8 }],
    items: [
      item('qa_run_a', 'qa_1', 'Enter your coupon in the field on the payment step.', 'ok', true),
      item('qa_run_a', 'qa_2', 'Your cart is preserved; just re-enter card details.', 'ok', true),
    ],
  },
  ds_refund: {
    dataset: DATASETS[2],
    examples: [
      {
        id: 'rf_1',
        datasetId: 'ds_refund',
        input: 'I want a refund for a gift I received',
        expected: null,
        metadata: { source: 'trace' },
        sourceTraceId: '99aa11bb-2c3d',
      },
    ],
    runs: [],
    items: [],
  },
}

export function listDatasets(): Dataset[] {
  return DATASETS
}

export function getDatasetDetail(id: string): DatasetDetail | null {
  return DETAILS[id] ?? null
}

export function exampleCount(id: string): number {
  return DETAILS[id]?.examples.length ?? 0
}

export function runCount(id: string): number {
  return DETAILS[id]?.runs.length ?? 0
}
