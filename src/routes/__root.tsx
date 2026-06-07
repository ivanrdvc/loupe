import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Scripts, useNavigate, useSearch } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { AppSidebar } from '#/components/app-sidebar'
import { CommandPaletteProvider } from '#/components/command-palette'
import { ShortcutsDialogProvider } from '#/components/shortcuts-dialog'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { Toaster } from '#/components/ui/sonner'
import { TooltipProvider } from '#/components/ui/tooltip'
import { InspectDrawerHost, ToolInspectDrawer } from '#/features/inspect'
import { sessionQuery } from '#/routes/sessions/-data'
import { traceSpansQuery } from '#/routes/traces/-data'
import appCss from '../styles.css?url'

/** Wide default window for the cross-page session drawer; full page uses the toolbar range. */
const SESSION_DRAWER_RANGE = 30

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  notFoundComponent: () => (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-4 text-sm text-primary underline underline-offset-4 hover:text-primary/80">
        Back to home
      </Link>
    </div>
  ),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'loupe',
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'icon',
        type: 'image/x-icon',
        sizes: '48x48 32x32 16x16',
        href: '/favicon.ico',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '192x192',
        href: '/logo192.png',
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'stylesheet',
        href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css',
      },
    ],
  }),
  shellComponent: RootDocument,
})

// Runs before React hydrates so the chosen color theme / font are applied
// without a flash. Reads localStorage and sets data-theme / data-font on
// <html>; CSS variants key off those attributes (see styles.css).
const APPLY_THEME_SCRIPT = `try{var t=localStorage.getItem('color-theme')||'loupe';document.documentElement.dataset.theme=t;var f=localStorage.getItem('app-font');if(f)document.documentElement.dataset.font=f;}catch(e){}`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: inline bootstrap; static literal, no untrusted input */}
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME_SCRIPT }} />
      </head>
      <body className="bg-sidebar font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" storageKey="theme" disableTransitionOnChange>
          <TooltipProvider delayDuration={0}>
            <SidebarProvider className="bg-sidebar">
              <CommandPaletteProvider>
                <ShortcutsDialogProvider>
                  <AppSidebar />
                  <SidebarInset>{children}</SidebarInset>
                  <SessionDrawerMount />
                  <TraceDrawerMount />
                  <ToolDrawerMount />
                  <Toaster />
                </ShortcutsDialogProvider>
              </CommandPaletteProvider>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

// The root has no validateSearch so its search type is `never`; we cast the
// reducer to `never` to satisfy the route-bound `ParamsReducerFn`. Runtime
// merges the returned object into whatever search the active route validates.
type SearchUpdater = (prev: Record<string, unknown>) => Record<string, unknown>
const clearKey =
  (key: string): SearchUpdater =>
  (prev) => ({ ...prev, [key]: undefined })

function TraceDrawerMount() {
  const search = useSearch({ strict: false }) as { trace?: string }
  const navigate = useNavigate()
  const previewTraceId = typeof search.trace === 'string' && search.trace ? search.trace : null
  return (
    <InspectDrawerHost
      previewId={previewTraceId}
      onClose={() => {
        void navigate({ search: clearKey('trace') as never, replace: true })
      }}
      query={(id) => traceSpansQuery(id)}
      expand={(id) => ({ expandTrace: { traceId: id } })}
    />
  )
}

function SessionDrawerMount() {
  const search = useSearch({ strict: false }) as { session?: string; trace?: string }
  const navigate = useNavigate()
  // When both are set, the trace drawer takes priority — never stack two Sheets.
  const previewSessionId = !search.trace && typeof search.session === 'string' && search.session ? search.session : null
  return (
    <InspectDrawerHost
      previewId={previewSessionId}
      onClose={() => {
        void navigate({ search: clearKey('session') as never, replace: true })
      }}
      query={(id) => sessionQuery(id, SESSION_DRAWER_RANGE)}
      expand={(id) => ({ expandSession: { sessionId: id, range: SESSION_DRAWER_RANGE } })}
    />
  )
}

function ToolDrawerMount() {
  const search = useSearch({ strict: false }) as { tool?: string; trace?: string; session?: string }
  const navigate = useNavigate()
  const tool = !search.trace && !search.session && typeof search.tool === 'string' && search.tool ? search.tool : null
  return (
    <ToolInspectDrawer
      toolName={tool}
      onClose={() => {
        void navigate({ search: clearKey('tool') as never, replace: true })
      }}
    />
  )
}
