import { QueryClient } from '@tanstack/react-query'
import { STALE_TELEMETRY_MS } from '#/lib/query-keys'

export function getContext() {
  return {
    queryClient: new QueryClient({
      defaultOptions: {
        queries: { staleTime: STALE_TELEMETRY_MS, refetchOnWindowFocus: false },
      },
    }),
  }
}
