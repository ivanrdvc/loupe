import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { useAgent } from '#/features/agent'

export const Route = createFileRoute('/admin')({
  component: Admin,
})

function Admin() {
  return (
    <Page title="Admin">
      <div className="max-w-2xl px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Feature flags</CardTitle>
            <CardDescription>Temporary toggles, persisted per browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentToggle />
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}

function AgentToggle() {
  const { enabled, setEnabled } = useAgent()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor="agent-flag">Agent panel</Label>
        <p className="text-sm text-muted-foreground">Show the agent launcher and right-side chat panel.</p>
      </div>
      <Switch id="agent-flag" checked={enabled} onCheckedChange={setEnabled} />
    </div>
  )
}
