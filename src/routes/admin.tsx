import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { useAgent } from '#/features/agent'
import { can, ROLES, type Role } from '#/lib/auth'
import { listUsers, setUserRole } from '#/lib/auth/admin'
import { errMessage } from '#/lib/format'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.user || !can(context.user, 'read', 'admin')) throw redirect({ to: '/' })
  },
  component: Admin,
})

function Admin() {
  return (
    <Page title="Admin">
      <div className="flex max-w-2xl flex-col gap-6 px-4 lg:px-6">
        <UsersCard />
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

function UsersCard() {
  const queryClient = useQueryClient()
  const { data: users, isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => listUsers() })

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: Role }) => setUserRole({ data: vars }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Role updated')
    },
    onError: (e) => toast.error(errMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Anyone can sign up as an editor. Promote or restrict access here.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="w-36">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onValueChange={(role) => roleMutation.mutate({ userId: u.id, role: role as Role })}
                    >
                      <SelectTrigger size="sm" className="w-full capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="capitalize">
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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
