export interface ChangelogSection {
  title: string
  body: string
}

export interface ChangelogVersion {
  version: string
  date: string | null
  url: string | null
  sections: ChangelogSection[]
}

const HEADER_RE = /^(?:\[([0-9][^\]\s]*)\]\(([^)]+)\)|([0-9][^\s]*))(?:\s+\(([^)]+)\))?\s*$/

export function parseChangelog(raw: string): ChangelogVersion[] {
  const blocks = raw.split(/^## /m).slice(1)
  const versions: ChangelogVersion[] = []

  for (const block of blocks) {
    const newlineIdx = block.indexOf('\n')
    const headerLine = (newlineIdx === -1 ? block : block.slice(0, newlineIdx)).trim()
    const body = newlineIdx === -1 ? '' : block.slice(newlineIdx + 1)
    const match = headerLine.match(HEADER_RE)
    if (!match) continue
    const [, linkedVersion, linkedUrl, plainVersion, date] = match
    const version = linkedVersion ?? plainVersion
    const url = linkedUrl ?? null
    if (!version) continue

    const sections: ChangelogSection[] = []
    const sectionChunks = body.split(/^### /m).slice(1)
    for (const chunk of sectionChunks) {
      const nl = chunk.indexOf('\n')
      const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim()
      const sectionBody = (nl === -1 ? '' : chunk.slice(nl + 1)).trim()
      if (sectionBody) sections.push({ title, body: sectionBody })
    }

    versions.push({ version, date: date ?? null, url, sections })
  }

  return versions
}
