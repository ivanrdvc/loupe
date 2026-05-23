import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { Markdown } from '#/components/markdown'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import changelogRaw from '../../../CHANGELOG.md?raw'
import { type ChangelogVersion, parseChangelog } from './-changelog-data'

const VERSIONS = parseChangelog(changelogRaw)
const APP_VERSION = __APP_VERSION__

export const Route = createFileRoute('/changelog/')({
  component: ChangelogPage,
})

function ChangelogPage() {
  return (
    <Page title="Changelog">
      <div className="px-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {VERSIONS.map((version) => (
            <VersionCard key={version.version} version={version} latest={version.version === APP_VERSION} />
          ))}
        </div>
      </div>
    </Page>
  )
}

function VersionCard({ version, latest }: { version: ChangelogVersion; latest: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium">
          <span>v{version.version}</span>
          {latest && <Badge variant="secondary">Latest</Badge>}
          {version.url && (
            <a
              href={version.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Compare
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
            </a>
          )}
        </CardTitle>
        {version.date && <div className="text-xs text-muted-foreground">{version.date}</div>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {version.sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1.5">
            <Badge variant="outline">{section.title}</Badge>
            <Markdown>{section.body}</Markdown>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
