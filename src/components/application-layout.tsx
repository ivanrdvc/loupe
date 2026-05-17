import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import {
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  HomeIcon,
  InboxIcon,
  PlayCircleIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { Logo } from '#/components/logo'
import { SettingsDialog } from '#/components/settings-dialog'
import { Avatar } from '#/components/ui/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '#/components/ui/dropdown'
import { Navbar, NavbarSection, NavbarSpacer } from '#/components/ui/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '#/components/ui/sidebar'
import { SidebarLayout } from '#/components/ui/sidebar-layout'
import { useTheme } from '#/hooks/use-theme'
import { useUser, useUserId } from '#/hooks/use-user'
import { truncateId } from '#/lib/format'
import { inboxUnreadCountQuery } from '#/routes/inbox/-data'
import { currentUserSessionsQuery } from '#/routes/sessions/-data'

const APP_VERSION = `v${__APP_VERSION__}`

function AccountDropdownMenu({ anchor }: { anchor: 'top start' | 'bottom end' }) {
  const { mode, toggle } = useTheme()
  const ThemeIcon = mode === 'dark' ? MoonIcon : SunIcon

  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="/account">
        <UserCircleIcon />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={toggle}>
        <ThemeIcon />
        <DropdownLabel>Toggle theme</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/login">
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const is = (path: string) => pathname.startsWith(path)
  const user = useUser()
  const [userId] = useUserId()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: unreadCount = 0 } = useQuery(inboxUnreadCountQuery())
  const { data: sessionsData } = useQuery(currentUserSessionsQuery(7, userId))
  const flush = /^\/sessions\/[^/]+/.test(pathname)
  const recentSessions = (sessionsData?.sessions ?? []).slice(0, 5)

  return (
    <>
      <SettingsDialog open={settingsOpen} onClose={setSettingsOpen} />
      <SidebarLayout
        flush={flush}
        navbar={
          <Navbar>
            <NavbarSpacer />
            <NavbarSection>
              <Dropdown>
                <DropdownButton plain aria-label="Account">
                  <Avatar initials={user.initials} square />
                </DropdownButton>
                <AccountDropdownMenu anchor="bottom end" />
              </Dropdown>
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar>
            <SidebarHeader>
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm/5 font-medium text-zinc-950 dark:text-white">
                <Logo className="!size-5" />
                <SidebarLabel>agentops</SidebarLabel>
                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]/4 font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {APP_VERSION}
                </span>
              </div>
            </SidebarHeader>

            <SidebarBody>
              <SidebarSection>
                <SidebarItem href="/" current={pathname === '/'}>
                  <HomeIcon />
                  <SidebarLabel>Home</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/sessions" current={is('/sessions')}>
                  <ChatBubbleLeftRightIcon />
                  <SidebarLabel>Sessions</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/runs" current={is('/runs') || is('/live')}>
                  <PlayCircleIcon />
                  <SidebarLabel>Runs</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/mcp" current={is('/mcp')}>
                  <PuzzlePieceIcon />
                  <SidebarLabel>MCP</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/evals" current={is('/evals')}>
                  <BeakerIcon />
                  <SidebarLabel>Evals</SidebarLabel>
                </SidebarItem>
              </SidebarSection>

              {recentSessions.length > 0 && (
                <SidebarSection className="gap-0! max-lg:hidden">
                  <SidebarHeading>Recent</SidebarHeading>
                  {recentSessions.map((session) => (
                    <SidebarItem key={session.sessionId} href={`/sessions/${session.sessionId}`}>
                      {session.title?.trim() || session.firstInput?.trim() || truncateId(session.sessionId)}
                    </SidebarItem>
                  ))}
                </SidebarSection>
              )}

              <SidebarSpacer />

              <SidebarSection>
                <SidebarItem onClick={() => setSettingsOpen(true)}>
                  <Cog6ToothIcon />
                  <SidebarLabel>Settings</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/inbox" current={is('/inbox')}>
                  <span data-slot="icon" className="relative">
                    <InboxIcon className="size-full" />
                    {unreadCount > 0 && (
                      <span className="pointer-events-none absolute top-0 right-0 flex min-w-3.5 translate-x-1/3 -translate-y-1/3 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
                        <span className="relative inline-flex min-w-3.5 rounded-full bg-rose-500 px-1 text-center text-[9px]/3.5 font-semibold text-white shadow-sm">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      </span>
                    )}
                  </span>
                  <SidebarLabel>Inbox</SidebarLabel>
                </SidebarItem>
              </SidebarSection>
            </SidebarBody>

            <SidebarFooter className="max-lg:hidden">
              <Dropdown>
                <DropdownButton as={SidebarItem} className="py-1! sm:py-1!">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={user.initials} className="size-8 bg-zinc-900 text-white" square />
                    <span className="min-w-0">
                      <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs/4 font-normal text-zinc-500 dark:text-zinc-400">
                        {user.email}
                      </span>
                    </span>
                  </span>
                  <ChevronUpIcon />
                </DropdownButton>
                <AccountDropdownMenu anchor="top start" />
              </Dropdown>
            </SidebarFooter>
          </Sidebar>
        }
      >
        {children}
      </SidebarLayout>
    </>
  )
}
