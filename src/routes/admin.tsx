import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { useAssistant } from '#/features/assistant'

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
            <AssistantToggle />
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}

function AssistantToggle() {
  const { enabled, setEnabled } = useAssistant()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor="assistant-flag">Assistant panel</Label>
        <p className="text-sm text-muted-foreground">Show the assistant launcher and right-side chat panel.</p>
      </div>
      <Switch id="assistant-flag" checked={enabled} onCheckedChange={setEnabled} />
    </div>
  )
}
