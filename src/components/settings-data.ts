import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'
import { queryKeys } from '#/lib/query-keys'
import { getActiveProviderId, listProviderStatus, PROVIDER_COOKIE, type ProviderId } from '#/lib/telemetry'

const fetchProviders = createServerFn({ method: 'GET' }).handler(async () => {
  return { active: getActiveProviderId(), providers: listProviderStatus() }
})

export const setProviderFn = createServerFn({ method: 'POST' })
  .inputValidator((id: ProviderId) => {
    if (id !== 'openobserve' && id !== 'app-insights') throw new Error(`unknown provider: ${id}`)
    return id
  })
  .handler(async ({ data }) => {
    setCookie(PROVIDER_COOKIE, data, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return { active: data }
  })

export const providersQuery = () =>
  queryOptions({
    queryKey: queryKeys.providers.all(),
    queryFn: () => fetchProviders(),
    staleTime: Number.POSITIVE_INFINITY,
  })
