export const queryKeys = {
  sessions: {
    all: () => ['sessions'] as const,
    window: (range: string, userId = '') => ['sessions', userId, { range }] as const,
    currentUserWindow: (range: string, userId: string) => ['sessions', 'current-user', userId, { range }] as const,
    detailWindow: (id: string, range: string) => ['sessions', id, { range }] as const,
  },
  traces: {
    all: () => ['traces'] as const,
    window: (range: string, userId = '') => ['traces', userId, { range }] as const,
    detail: (id: string) => ['traces', id] as const,
  },
  spans: {
    window: (range: string, userId = '') => ['spans', userId, { range }] as const,
  },
  tasks: {
    window: (range: string, userId = '') => ['tasks', userId, { range }] as const,
  },
  inbox: {
    all: () => ['inbox'] as const,
    open: () => ['inbox', 'open'] as const,
    unreadCount: () => ['inbox', 'unread-count'] as const,
  },
  home: {
    all: () => ['home'] as const,
    window: (range: string) => ['home', { range }] as const,
  },
  mcp: {
    all: () => ['mcp'] as const,
  },
  tools: {
    all: () => ['tools'] as const,
    catalog: (range: string) => ['tools', 'catalog', { range }] as const,
    detail: (name: string) => ['tools', 'detail', name] as const,
    recent: (name: string) => ['tools', 'recent', name] as const,
  },
  providers: {
    all: () => ['providers'] as const,
  },
  prompts: {
    list: () => ['prompts', 'list'] as const,
    detail: (id: number) => ['prompts', 'detail', id] as const,
  },
  logs: {
    byTraceIds: (ids: readonly string[]) => ['logs', { ids: [...ids].sort() }] as const,
  },
  notes: {
    list: () => ['notes', 'list'] as const,
    byTarget: (kind: string, id: string) => ['notes', 'target', kind, id] as const,
    flagsForKind: (kind: string) => ['notes', 'flags', kind] as const,
  },
  datasets: {
    all: () => ['datasets'] as const,
    list: () => ['datasets', 'list'] as const,
    detail: (id: string) => ['datasets', 'detail', id] as const,
    runDefaults: () => ['datasets', 'run-defaults'] as const,
  },
  scores: {
    byTarget: (kind: string, id: string) => ['scores', 'target', kind, id] as const,
    summariesForKind: (kind: string) => ['scores', 'summaries', kind] as const,
    configs: () => ['scores', 'configs'] as const,
    rollup: (range: string) => ['scores', 'rollup', { range }] as const,
  },
  evals: {
    all: () => ['evals'] as const,
    definitions: () => ['evals', 'definitions'] as const,
    definition: (id: number) => ['evals', 'definition', id] as const,
    run: (runId: number) => ['evals', 'run', runId] as const,
    runScores: (runId: number) => ['evals', 'run-scores', runId] as const,
    definitionScores: (id: number) => ['evals', 'definition-scores', id] as const,
    compare: (base: number, head: number) => ['evals', 'compare', base, head] as const,
    onlineStats: () => ['evals', 'online-stats'] as const,
    judgeDefaults: () => ['evals', 'judge-defaults'] as const,
  },
}

export const STALE_LIVE_MS = 15_000
export const STALE_TELEMETRY_MS = 60_000
