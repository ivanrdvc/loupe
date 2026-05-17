export const queryKeys = {
  sessions: {
    all: () => ['sessions'] as const,
    window: (range: string) => ['sessions', { range }] as const,
    currentUserWindow: (range: string, userId: string) => ['sessions', 'current-user', userId, { range }] as const,
    detail: (id: string) => ['sessions', id] as const,
    detailWindow: (id: string, range: string) => ['sessions', id, { range }] as const,
  },
  runs: {
    all: () => ['runs'] as const,
    detail: (id: string) => ['runs', id] as const,
  },
  inbox: {
    all: () => ['inbox'] as const,
    unreadCount: () => ['inbox', 'unread-count'] as const,
  },
  home: {
    all: () => ['home'] as const,
    window: (range: string) => ['home', { range }] as const,
  },
  mcp: {
    all: () => ['mcp'] as const,
  },
  providers: {
    all: () => ['providers'] as const,
  },
}

export const STALE_LIVE_MS = 15_000
export const STALE_TELEMETRY_MS = 60_000
