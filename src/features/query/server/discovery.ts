import { json } from '../logic/respond'

// Discovery root: a self-describing map so an agent landing on /api knows the
// compose loop without reading docs. Keep in sync with docs/reference/http-api.md.
const INDEX = {
  service: 'loupe HTTP API',
  description:
    'Read-only, localhost-only. Classified spans, reconstructed conversation, and summed aggregates for LLM run debugging. A trace is a run; a session bundles traces.',
  compose_loop:
    'GET /api/search (read facets) -> pick id -> GET /api/traces/:id (or /conversation) -> GET /api/traces/:id/spans/:spanId -> add ?detail=full when truncation hides the answer',
  context_guard:
    'Tool/LLM I/O truncated ~400 chars by default; errors never truncated. Lists + conversation page with limit/offset (see page.has_more; server-side sort/filter, so a page is exact, not a scan-window sample). ?detail=full untruncated, ?detail=raw adds rawAttributes. Any response over ~300 KB (incl. detail=full/raw) auto-dumps to a temp file and returns { path, summary }; ?detail=dump forces it.',
  endpoints: [
    {
      method: 'GET',
      path: '/api/search',
      purpose:
        'Research primitive. Filters: entity(traces|spans), q, status, agent, model, session, user, category, min_cost, min_tokens, min_duration_ms, sort(recent|cost|tokens|duration), since, limit, offset. Returns facets + page.',
    },
    { method: 'GET', path: '/api/traces', purpose: 'List/search traces (alias of /api/search?entity=traces).' },
    {
      method: 'GET',
      path: '/api/traces/:id',
      purpose: 'One trace: classified span tree + aggregates. ?detail=full|raw|dump.',
    },
    {
      method: 'GET',
      path: '/api/traces/:id/conversation',
      purpose: 'Reconstructed conversation events (message/tool_call/tool_result/agent_call). Paged (limit/offset).',
    },
    { method: 'GET', path: '/api/traces/:id/spans/:spanId', purpose: 'Single span, full untruncated I/O.' },
    { method: 'GET', path: '/api/traces/:id/brief', purpose: 'Markdown "explain this run".' },
    {
      method: 'GET',
      path: '/api/sessions/:id',
      purpose: 'Session spine: trace_ids + per-trace and overall aggregates.',
    },
    { method: 'GET', path: '/api/sessions/:id/brief', purpose: 'Markdown session summary.' },
  ],
} as const

export const discoveryResponse = (): Response => json(INDEX)
