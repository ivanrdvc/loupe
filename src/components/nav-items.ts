import {
  Archive,
  Box,
  CirclePlay,
  Database,
  House,
  Inbox,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  PencilLine,
  Puzzle,
  SquarePen,
  TestTube,
} from 'lucide-react'
import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react'
import type { AnimatedIconHandle } from '#/components/icons/animated-icon'
import { ArchiveIcon } from '#/components/icons/archive'
import { BoxIcon } from '#/components/icons/box'
import { ClipboardCheckIcon } from '#/components/icons/clipboard-check'
import { DatabaseIcon } from '#/components/icons/database'
import { FilePenLineIcon } from '#/components/icons/file-pen-line'
import { HomeIcon } from '#/components/icons/home'
import { MessageSquareMoreIcon } from '#/components/icons/message-square-more'
import { PlayIcon } from '#/components/icons/play'
import { SquarePenIcon } from '#/components/icons/square-pen'
import { TestTubeIcon } from '#/components/icons/test-tube'

type NavTo =
  | '/'
  | '/sessions'
  | '/traces'
  | '/tasks'
  | '/mcp'
  | '/notes'
  | '/inventory/system-prompts'
  | '/inventory/agents'
  | '/datasets'
  | '/evals'
  | '/inbox'

type NavGroup = 'observe' | 'workbench' | 'inventory' | 'inbox'

type AnimatedIcon = ForwardRefExoticComponent<
  HTMLAttributes<HTMLDivElement> & { size?: number } & RefAttributes<AnimatedIconHandle>
>

export interface NavItem {
  to: NavTo
  label: string
  // Static icon (command palette etc.); the sidebar prefers animatedIcon when set.
  icon: LucideIcon
  animatedIcon?: AnimatedIcon
  group: NavGroup
  soon?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: House, animatedIcon: HomeIcon, group: 'observe' },
  { to: '/sessions', label: 'Sessions', icon: MessagesSquare, animatedIcon: MessageSquareMoreIcon, group: 'observe' },
  { to: '/traces', label: 'Traces', icon: CirclePlay, animatedIcon: PlayIcon, group: 'observe' },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, animatedIcon: ClipboardCheckIcon, group: 'observe' },
  { to: '/notes', label: 'Notes', icon: PencilLine, animatedIcon: FilePenLineIcon, group: 'workbench' },
  { to: '/datasets', label: 'Datasets', icon: Database, animatedIcon: DatabaseIcon, group: 'workbench' },
  { to: '/evals', label: 'Evals', icon: TestTube, animatedIcon: TestTubeIcon, group: 'workbench' },
  {
    to: '/inventory/system-prompts',
    label: 'System Prompts',
    icon: SquarePen,
    animatedIcon: SquarePenIcon,
    group: 'inventory',
  },
  { to: '/inventory/agents', label: 'Agents', icon: Box, animatedIcon: BoxIcon, group: 'inventory' },
  { to: '/mcp', label: 'MCP', icon: Puzzle, group: 'inventory' },
  { to: '/inbox', label: 'Inbox', icon: Inbox, group: 'inbox' },
]

// Expandable parent for the Inventory section. Children come from NAV_ITEMS where group === 'inventory'.
export const INVENTORY_GROUP = {
  label: 'Inventory',
  icon: Archive,
  animatedIcon: ArchiveIcon,
  basePath: '/inventory',
} as const

export function navMatches(item: NavItem, path: string): boolean {
  return item.to === '/' ? path === '/' : path.startsWith(item.to)
}
