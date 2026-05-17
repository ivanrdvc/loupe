import {
  createRouter as createTanStackRouter,
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { RouterError } from './components/router-error'
import { getContext } from './integrations/tanstack-query/root-provider'
import { serialize as serializeRange, type TimeRange } from './lib/time-range'
import { routeTree } from './routeTree.gen'

// Keep `range` URL params compact: `?range=7` or `?range=1700000000000-1700100000000`
// instead of TanStack's default `?range=%7B%22from%22%3A...%7D` JSON encoding.
// Route `validateSearch` calls `parse(search.range)` which already accepts both
// the compact string form and (legacy) object form, so reading is unchanged.
function stringifySearch(search: Record<string, unknown>): string {
  if (search.range != null && typeof search.range === 'object') {
    return defaultStringifySearch({
      ...search,
      range: serializeRange(search.range as TimeRange),
    })
  }
  return defaultStringifySearch(search)
}

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouterError,
    parseSearch: defaultParseSearch,
    stringifySearch,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
