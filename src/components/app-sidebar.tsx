import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  ChevronsUpDownIcon,
  FlaskConicalIcon,
  HomeIcon,
  InboxIcon,
  LogOutIcon,
  MessagesSquareIcon,
  MoonIcon,
  PlayCircleIcon,
  PuzzleIcon,
  SettingsIcon,
  SunIcon,
  UserCircleIcon,
} from 'lucide-react'
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
} from '#/components/ui/sidebar'
import { useUser, useUserId } from '#/hooks/use-user'
import { truncateId } from '#/lib/format'
import { DEFAULT_TIME_RANGE_DAYS } from '#/lib/time-range'
import { inboxUnreadCountQuery } from '#/routes/inbox/-data'
import { currentUserSessionsQuery } from '#/routes/sessions/-data'

const APP_VERSION = `v${__APP_VERSION__}`

type NavItem = {
  to: '/' | '/sessions' | '/runs' | '/mcp' | '/evals'
  label: string
  icon: typeof HomeIcon
  match: (path: string) => boolean
}

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: HomeIcon, match: (p) => p === '/' },
  { to: '/sessions', label: 'Sessions', icon: MessagesSquareIcon, match: (p) => p.startsWith('/sessions') },
  { to: '/runs', label: 'Runs', icon: PlayCircleIcon, match: (p) => p.startsWith('/runs') || p.startsWith('/live') },
  { to: '/mcp', label: 'MCP', icon: PuzzleIcon, match: (p) => p.startsWith('/mcp') },
  { to: '/evals', label: 'Evals', icon: FlaskConicalIcon, match: (p) => p.startsWith('/evals') },
]

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [userId] = useUserId()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: unreadCount = 0 } = useQuery(inboxUnreadCountQuery())
  const { data: sessionsData } = useQuery(currentUserSessionsQuery(7, userId))
  const recentSessions = (sessionsData?.sessions ?? []).slice(0, 5)

  return (
    <>
      <SettingsDialog open={settingsOpen} onClose={setSettingsOpen} />
      <Sidebar collapsible="none">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Logo className="size-5!" />
            <span className="text-sm font-semibold">agentops</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]/4 font-medium text-muted-foreground">
              {APP_VERSION}
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {MAIN_NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.match(pathname)} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
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
                          search={{ days: DEFAULT_TIME_RANGE_DAYS, view: 'conversation' }}
                        >
                          <span className="truncate">
                            {session.title?.trim() || session.firstInput?.trim() || truncateId(session.sessionId)}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setSettingsOpen(true)} tooltip="Settings">
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/inbox')} tooltip="Inbox">
                    <Link to="/inbox">
                      <InboxIcon />
                      <span>Inbox</span>
                      {unreadCount > 0 && (
                        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
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
  const { resolvedTheme, setTheme } = useTheme()
  const ThemeIcon = resolvedTheme === 'dark' ? MoonIcon : SunIcon

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
                <AvatarFallback className="rounded-md bg-zinc-900 text-xs font-medium text-white">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem asChild>
              <a href="/account">
                <UserCircleIcon />
                My account
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
              <ThemeIcon />
              Toggle theme
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/login">
                <LogOutIcon />
                Sign out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
