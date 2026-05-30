export const TAG_COLORS = [
  { name: 'slate', class: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30' },
  { name: 'red', class: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
  { name: 'orange', class: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  { name: 'amber', class: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  { name: 'green', class: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30' },
  { name: 'teal', class: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30' },
  { name: 'sky', class: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' },
  { name: 'blue', class: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' },
  { name: 'violet', class: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30' },
  { name: 'pink', class: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30' },
] as const

export type TagColorName = (typeof TAG_COLORS)[number]['name']

export function tagColorClass(name: string): string {
  return TAG_COLORS.find((c) => c.name === name)?.class ?? TAG_COLORS[0].class
}

export function nextTagColor(usedColors: string[]): TagColorName {
  const counts = new Map<string, number>()
  for (const c of usedColors) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best: TagColorName = TAG_COLORS[0].name
  let bestCount = Number.POSITIVE_INFINITY
  for (const c of TAG_COLORS) {
    const n = counts.get(c.name) ?? 0
    if (n < bestCount) {
      best = c.name
      bestCount = n
    }
  }
  return best
}
