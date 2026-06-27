import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { listToolSignals } from '#/features/mcp'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'

const fetchToolSignals = createServerFn({ method: 'GET' }).handler(() => listToolSignals())

export const toolSignalsQuery = () =>
  queryOptions({
    queryKey: [...queryKeys.mcp.all(), 'signals'],
    queryFn: () => fetchToolSignals(),
    staleTime: STALE_TELEMETRY_MS,
  })
