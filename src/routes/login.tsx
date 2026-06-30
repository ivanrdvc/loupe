import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Aurora } from '#/components/aurora'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { authClient } from '#/lib/auth/client'
import { bootstrapOwner, getSession } from '#/lib/auth/session'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const user = await getSession()
    if (user) throw redirect({ href: safeDest(search.redirect) })
  },
  loader: async () => {
    await bootstrapOwner()
  },
  component: Login,
})

// Only ever navigate to a same-origin path — never an attacker-supplied origin.
// Rejects protocol-relative (`//evil.com`) and backslash (`/\evil.com`) forms
// that browsers normalize to an off-site URL.
function safeDest(redirectParam: string | undefined): string {
  if (!redirectParam?.startsWith('/')) return '/'
  if (redirectParam[1] === '/' || redirectParam[1] === '\\') return '/'
  return redirectParam
}

function Login() {
  const navigate = useNavigate()
  const { redirect: redirectParam } = Route.useSearch()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    const { error } =
      mode === 'signin'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: email.split('@')[0] })
    setPending(false)
    if (error) {
      toast.error(error.message ?? 'Authentication failed')
      return
    }
    void navigate({ href: safeDest(redirectParam) })
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex items-center justify-center bg-background p-6 md:p-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{mode === 'signin' ? 'Sign in to loupe' : 'Create your account'}</CardTitle>
            <CardDescription>
              {mode === 'signin' ? 'Enter your email and password.' : 'New accounts can read and annotate.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
              </Button>
            </form>
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            >
              {mode === 'signin' ? 'No account? Sign up' : 'Have an account? Sign in'}
            </button>
          </CardContent>
        </Card>
      </div>
      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <Aurora animated />
      </div>
    </div>
  )
}
