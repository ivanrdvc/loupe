import {
  CheckListIcon,
  CubeIcon,
  DatabaseIcon,
  Edit02Icon,
  Home01Icon,
  InboxIcon,
  MessageMultiple01Icon,
  PencilEdit02Icon,
  PlayCircleIcon,
  PuzzleIcon,
  TestTubeIcon,
} from '@hugeicons/core-free-icons'

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
  { to: '/tasks', label: 'Tasks', icon: CheckListIcon, group: 'observe' },
  { to: '/notes', label: 'Notes', icon: PencilEdit02Icon, group: 'workbench' },
  { to: '/datasets', label: 'Datasets', icon: DatabaseIcon, group: 'workbench' },
  { to: '/evals', label: 'Evals', icon: TestTubeIcon, group: 'workbench' },
  { to: '/inventory/system-prompts', label: 'System Prompts', icon: Edit02Icon, group: 'inventory' },
  { to: '/inventory/agents', label: 'Agents', icon: CubeIcon, group: 'inventory' },
  { to: '/mcp', label: 'MCP', icon: PuzzleIcon, group: 'inventory', soon: true },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon, group: 'inbox' },
]

// Expandable parent for the Inventory section. Children come from NAV_ITEMS where group === 'inventory'.
export const INVENTORY_GROUP = {
  label: 'Inventory',
  icon: CubeIcon,
  basePath: '/inventory',
} as const

export function navMatches(item: NavItem, path: string): boolean {
  return item.to === '/' ? path === '/' : path.startsWith(item.to)
}
