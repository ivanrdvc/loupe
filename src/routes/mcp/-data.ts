import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { listMcpRegistryWithLint } from '#/features/mcp'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'

const fetchMcp = createServerFn({ method: 'GET' }).handler(() => listMcpRegistryWithLint())

export const mcpQuery = () =>
  queryOptions({
    queryKey: queryKeys.mcp.all(),
    queryFn: () => fetchMcp(),
    staleTime: STALE_TELEMETRY_MS,
  })
