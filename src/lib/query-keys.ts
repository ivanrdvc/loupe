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
    recent: () => ['inbox', 'recent'] as const,
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
    all: () => ['prompts'] as const,
    folders: () => ['prompts', 'folders'] as const,
    list: (folderId?: number | null) => ['prompts', 'list', folderId ?? null] as const,
    detail: (promptId: number) => ['prompts', 'detail', promptId] as const,
    runDefaults: () => ['prompts', 'run-defaults'] as const,
    tags: () => ['prompts', 'tags'] as const,
  },
  logs: {
    byTraceIds: (ids: readonly string[]) => ['logs', { ids: [...ids].sort() }] as const,
  },
  notes: {
    list: () => ['notes', 'list'] as const,
    byTarget: (kind: string, id: string) => ['notes', 'target', kind, id] as const,
    flagsForKind: (kind: string) => ['notes', 'flags', kind] as const,
  },
}

export const STALE_LIVE_MS = 15_000
export const STALE_TELEMETRY_MS = 60_000
