import { tool } from 'ai'
import { z } from 'zod'

/**
 * A named playbook the agent loads on demand: descriptions sit in the prompt,
 * full content is fetched via load_skill (progressive disclosure).
 */
export interface Skill {
  name: string
  description: string
  load: () => string | null
}

export const skills: Skill[] = []

/**
 * Always-present skill index — names + descriptions only, no bodies.
 */
export function skillsCatalog(): string {
  if (!skills.length) return ''
  return `\n\nSkills — load the full content with load_skill before relying on one:${skills
    .map((s) => `\n- ${s.name}: ${s.description}`)
    .join('')}`
}

export const loadSkillTool = tool({
  description:
    'Load the full content of a skill by name. Skills are the playbooks/context listed in your instructions; load one before relying on it.',
  inputSchema: z.object({ name: z.string().describe('The skill name from the skills list.') }),
  execute: async ({ name }) => {
    const skill = skills.find((s) => s.name === name)
    if (!skill) return { found: false as const }
    const content = skill.load()
    return content ? { found: true as const, content } : { found: false as const }
  },
})
