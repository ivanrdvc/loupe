import { readFileSync } from 'node:fs'
import { tool } from 'ai'
import { z } from 'zod'

/** A named playbook/context the agent loads on demand. Descriptions are always in
 *  the prompt (cheap); full content is fetched via load_skill (progressive disclosure). */
export interface Skill {
  name: string
  description: string
  load: () => string | null
}

// A fork (or user) describes the agent being observed in this file; reading it
// grounds answers in the actual project, not generic telemetry-speak. Read fresh
// each turn so edits apply without a restart; absent file → null.
const PROFILE_PATH = process.env.AGENT_PROFILE_PATH ?? 'agent-profile.md'

function projectProfile(): string | null {
  try {
    // HTML comments are editor guidance, not for the model — strip them so an
    // unfilled template counts as empty.
    const text = readFileSync(PROFILE_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    return text.trim() || null
  } catch {
    return null
  }
}

export const skills: Skill[] = [
  {
    name: 'project-profile',
    description:
      "The observed project's profile: what its agents do, the tools they use, and known quirks. Load before answering anything specific to the user's own project.",
    load: projectProfile,
  },
]

/** Always-present skill index — names + descriptions only, no bodies. */
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
