import {
  Edit02Icon,
  Home01Icon,
  InboxIcon,
  Logout01Icon,
  MessageMultiple01Icon,
  Moon01Icon,
  MoreHorizontalCircle01Icon,
  MoreVerticalIcon,
  PlayCircleIcon,
  PuzzleIcon,
  Settings01Icon,
  StickyNote01Icon,
  Sun01Icon,
  TestTubeIcon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { Logo } from '#/components/logo'
import { SettingsDialog } from '#/components/settings-dialog'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '#/components/ui/sidebar'
import { useUser, useUserId } from '#/hooks/use-user'
import { DEFAULT } from '#/lib/time-range'
import { inboxUnreadCountQuery } from '#/routes/inbox/-data'
import { currentUserSessionsQuery } from '#/routes/sessions/-data'

const APP_VERSION = `v${__APP_VERSION__}`

type NavItem = {
  to: '/' | '/sessions' | '/traces' | '/mcp' | '/evals' | '/notes' | '/prompts'
  label: string
  icon: typeof Home01Icon
  match: (path: string) => boolean
}

const OBSERVE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home01Icon, match: (p) => p === '/' },
  { to: '/sessions', label: 'Sessions', icon: MessageMultiple01Icon, match: (p) => p.startsWith('/sessions') },
  {
    to: '/traces',
    label: 'Traces',
    icon: PlayCircleIcon,
    match: (p) => p.startsWith('/traces'),
  },
  { to: '/mcp', label: 'MCP', icon: PuzzleIcon, match: (p) => p.startsWith('/mcp') },
]

const WORKBENCH_NAV: NavItem[] = [
  { to: '/notes', label: 'Notes', icon: StickyNote01Icon, match: (p) => p.startsWith('/notes') },
  { to: '/prompts', label: 'Prompts', icon: Edit02Icon, match: (p) => p.startsWith('/prompts') },
  { to: '/evals', label: 'Evals', icon: TestTubeIcon, match: (p) => p.startsWith('/evals') },
]

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: unreadCount = 0 } = useQuery(inboxUnreadCountQuery())
  const [userId] = useUserId()
  const { data: recentData } = useQuery(currentUserSessionsQuery(DEFAULT, userId))
  const recentSessions = recentData?.sessions ?? []

  return (
    <>
      <SettingsDialog open={settingsOpen} onClose={setSettingsOpen} />
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="flex h-12 shrink-0 flex-row items-center gap-2 border-b px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                <Link to="/">
                  <Logo className="size-5!" />
                  <span className="text-base font-semibold">agentops</span>
                  <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]/4 font-medium text-muted-foreground">
                    {APP_VERSION}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="mt-2">
            <SidebarGroupContent>
              <SidebarMenu>
                {OBSERVE_NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.match(pathname)}>
                      <Link to={item.to}>
                        <HugeiconsIcon icon={item.icon} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Workbench</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKBENCH_NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.match(pathname)}>
                      <Link to={item.to}>
                        <HugeiconsIcon icon={item.icon} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {recentSessions.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Recent</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recentSessions.map((session) => (
                    <SidebarMenuItem key={session.sessionId}>
                      <SidebarMenuButton asChild>
                        <Link
                          to="/sessions/$sessionId"
                          params={{ sessionId: session.sessionId }}
                          search={{ range: DEFAULT, view: 'conversation' }}
                        >
                          <span className="truncate">{session.title ?? session.firstInput ?? session.sessionId}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="text-sidebar-foreground/70">
                      <Link to="/sessions" search={{ userId: userId || undefined }}>
                        <HugeiconsIcon icon={MoreHorizontalCircle01Icon} />
                        <span>More</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setSettingsOpen(true)}>
                    <HugeiconsIcon icon={Settings01Icon} />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/inbox')}>
                    <Link to="/inbox">
                      <span className="relative shrink-0">
                        <HugeiconsIcon icon={InboxIcon} className="size-4 shrink-0" />
                        {unreadCount > 0 && (
                          <span className="pointer-events-none absolute -top-1 -right-1 flex">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
                            <span className="relative inline-flex min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-center text-[9px]/3.5 font-semibold text-destructive-foreground shadow-sm">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          </span>
                        )}
                      </span>
                      <span>Inbox</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    </>
  )
}

function NavUser() {
  const user = useUser()
  const { isMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const themeIcon = resolvedTheme === 'dark' ? Moon01Icon : Sun01Icon

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-secondary text-xs font-medium text-secondary-foreground">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <HugeiconsIcon icon={MoreVerticalIcon} className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem asChild>
              <a href="/account">
                <HugeiconsIcon icon={UserCircleIcon} />
                My account
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
              <HugeiconsIcon icon={themeIcon} />
              Toggle theme
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/login">
                <HugeiconsIcon icon={Logout01Icon} />
                Sign out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
