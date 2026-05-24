import {
  InboxIcon,
  KeyboardIcon,
  Logout01Icon,
  Moon01Icon,
  MoreHorizontalCircle01Icon,
  MoreVerticalIcon,
  News01Icon,
  Settings01Icon,
  Sun01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { Logo } from '#/components/logo'
import { NAV_ITEMS, type NavItem, navMatches } from '#/components/nav-items'
import { SettingsDialog } from '#/components/settings-dialog'
import { useShortcutsDialog } from '#/components/shortcuts-dialog'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar'
import { useUser, useUserId } from '#/hooks/use-user'
import { DEFAULT } from '#/lib/time-range'
import { inboxUnreadCountQuery } from '#/routes/inbox/-data'
import { currentUserSessionsQuery } from '#/routes/sessions/-data'

const APP_VERSION = `v${__APP_VERSION__}`

const OBSERVE_NAV = NAV_ITEMS.filter((n) => n.group === 'observe')
const WORKBENCH_NAV = NAV_ITEMS.filter((n) => n.group === 'workbench')

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
                  <NavRow key={item.to} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Workbench</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKBENCH_NAV.map((item) => (
                  <NavRow key={item.to} item={item} pathname={pathname} />
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

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  if (item.soon) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled
          className="cursor-default opacity-60 hover:bg-transparent hover:text-sidebar-foreground"
        >
          <HugeiconsIcon icon={item.icon} />
          <span>{item.label}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge>Soon</SidebarMenuBadge>
      </SidebarMenuItem>
    )
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={navMatches(item, pathname)}>
        <Link to={item.to}>
          <HugeiconsIcon icon={item.icon} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function NavUser() {
  const user = useUser()
  const { resolvedTheme, setTheme } = useTheme()
  const { setOpen: setShortcutsOpen } = useShortcutsDialog()
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
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-md">
                  <AvatarFallback className="rounded-md bg-secondary text-xs font-medium text-secondary-foreground">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                <HugeiconsIcon icon={themeIcon} />
                Toggle theme
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                <HugeiconsIcon icon={KeyboardIcon} />
                Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/changelog">
                  <HugeiconsIcon icon={News01Icon} />
                  Changelog
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
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
