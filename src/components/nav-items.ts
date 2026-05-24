import {
  Edit02Icon,
  Home01Icon,
  InboxIcon,
  MessageMultiple01Icon,
  PlayCircleIcon,
  PuzzleIcon,
  StickyNote01Icon,
  Task01Icon,
  TestTubeIcon,
} from '@hugeicons/core-free-icons'

type NavTo = '/' | '/sessions' | '/traces' | '/tasks' | '/mcp' | '/notes' | '/prompts' | '/evals' | '/inbox'

type NavGroup = 'observe' | 'workbench' | 'inbox'

export interface NavItem {
  to: NavTo
  label: string
  icon: typeof Home01Icon
  group: NavGroup
  soon?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home01Icon, group: 'observe' },
  { to: '/sessions', label: 'Sessions', icon: MessageMultiple01Icon, group: 'observe' },
  { to: '/traces', label: 'Traces', icon: PlayCircleIcon, group: 'observe' },
  { to: '/tasks', label: 'Tasks', icon: Task01Icon, group: 'observe' },
  { to: '/mcp', label: 'MCP', icon: PuzzleIcon, group: 'observe', soon: true },
  { to: '/notes', label: 'Notes', icon: StickyNote01Icon, group: 'workbench' },
  { to: '/prompts', label: 'Prompts', icon: Edit02Icon, group: 'workbench' },
  { to: '/evals', label: 'Evals', icon: TestTubeIcon, group: 'workbench', soon: true },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon, group: 'inbox' },
]

export function navMatches(item: NavItem, path: string): boolean {
  return item.to === '/' ? path === '/' : path.startsWith(item.to)
}
