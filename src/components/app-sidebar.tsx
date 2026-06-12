import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Ellipsis, EllipsisVertical, Keyboard, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Fragment, useRef, useState } from 'react'
import type { AnimatedIconHandle } from '#/components/icons/animated-icon'
import { MegaphoneIcon } from '#/components/icons/megaphone'
import { SettingsIcon } from '#/components/icons/settings'
import { Logo } from '#/components/logo'
import { INVENTORY_GROUP, NAV_ITEMS, type NavItem, navMatches } from '#/components/nav-items'
import { SettingsDialog } from '#/components/settings-dialog'
import { useShortcutsDialog } from '#/components/shortcuts-dialog'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '#/components/ui/sidebar'
import { useChangelogUnseen } from '#/hooks/use-changelog-unseen'
import { useUser, useUserId } from '#/hooks/use-user'
import { currentUserSessionsQuery } from '#/lib/session-queries'
import { DEFAULT } from '#/lib/time-range'

const APP_VERSION = `v${__APP_VERSION__}`

const OBSERVE_NAV = NAV_ITEMS.filter((n) => n.group === 'observe')
const WORKBENCH_NAV = NAV_ITEMS.filter((n) => n.group === 'workbench')
const INVENTORY_NAV = NAV_ITEMS.filter((n) => n.group === 'inventory')

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsIconRef = useRef<AnimatedIconHandle>(null)
  const changelogIconRef = useRef<AnimatedIconHandle>(null)
  const changelogUnseen = useChangelogUnseen(__APP_VERSION__)
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
                  <span className="gradient-text text-base font-semibold">loupe</span>
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
                  <Fragment key={item.to}>
                    <NavRow item={item} pathname={pathname} />
                    {item.to === '/tasks' && <InventoryNav pathname={pathname} />}
                  </Fragment>
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
                        <Link to="." search={(prev) => ({ ...(prev as object), session: session.sessionId })}>
                          <span className="truncate">{session.title ?? session.firstInput ?? session.sessionId}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="text-sidebar-foreground/70">
                      <Link to="/sessions" search={{ userId: userId || undefined }}>
                        <Ellipsis />
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
                  <SidebarMenuButton
                    onClick={() => setSettingsOpen(true)}
                    onMouseEnter={() => settingsIconRef.current?.startAnimation()}
                    onMouseLeave={() => settingsIconRef.current?.stopAnimation()}
                  >
                    <SettingsIcon ref={settingsIconRef} size={16} className="flex shrink-0" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith('/changelog')}>
                    <Link
                      to="/changelog"
                      onMouseEnter={() => changelogIconRef.current?.startAnimation()}
                      onMouseLeave={() => changelogIconRef.current?.stopAnimation()}
                    >
                      <MegaphoneIcon ref={changelogIconRef} size={16} className="flex shrink-0" />
                      <span>Changelog</span>
                    </Link>
                  </SidebarMenuButton>
                  {changelogUnseen && (
                    <SidebarMenuBadge className="pointer-events-none" title="New release">
                      <span className="size-2 rounded-full bg-primary" />
                      <span className="sr-only">New release</span>
                    </SidebarMenuBadge>
                  )}
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
  const iconRef = useRef<AnimatedIconHandle>(null)
  const icon = item.animatedIcon ? (
    <item.animatedIcon ref={iconRef} size={16} className="flex shrink-0" />
  ) : (
    <item.icon />
  )
  const hoverProps = item.animatedIcon
    ? {
        onMouseEnter: () => iconRef.current?.startAnimation(),
        onMouseLeave: () => iconRef.current?.stopAnimation(),
      }
    : undefined
  if (item.soon) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled
          className="cursor-default opacity-60 hover:bg-transparent hover:text-sidebar-foreground"
        >
          {icon}
          <span>{item.label}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge>Soon</SidebarMenuBadge>
      </SidebarMenuItem>
    )
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={navMatches(item, pathname)}>
        <Link to={item.to} {...hoverProps}>
          {icon}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function InventoryNav({ pathname }: { pathname: string }) {
  const iconRef = useRef<AnimatedIconHandle>(null)
  const sectionActive =
    pathname.startsWith(INVENTORY_GROUP.basePath) || INVENTORY_NAV.some((item) => navMatches(item, pathname))
  return (
    <Collapsible asChild defaultOpen={sectionActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            onMouseEnter={() => iconRef.current?.startAnimation()}
            onMouseLeave={() => iconRef.current?.stopAnimation()}
          >
            <INVENTORY_GROUP.animatedIcon ref={iconRef} size={16} className="flex shrink-0" />
            <span>{INVENTORY_GROUP.label}</span>
            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {INVENTORY_NAV.map((item) => (
              <SidebarMenuSubItem key={item.to}>
                <SidebarMenuSubButton asChild isActive={navMatches(item, pathname)}>
                  <Link to={item.to}>
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function NavUser() {
  const user = useUser()
  const { resolvedTheme, setTheme } = useTheme()
  const { setOpen: setShortcutsOpen } = useShortcutsDialog()
  const ThemeIcon = resolvedTheme === 'dark' ? Moon : Sun

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
              <EllipsisVertical className="ml-auto size-4" />
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
                <ThemeIcon />
                Toggle theme
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                <Keyboard />
                Keyboard shortcuts
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
