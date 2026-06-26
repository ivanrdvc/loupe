import { Sparkles } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { useAgent } from './agent-provider'

/** Fixed bottom-right launcher. Hidden while the panel is open. */
export function AgentLauncher() {
  const { enabled, open, setOpen } = useAgent()
  if (!enabled || open) return null
  return (
    <Button
      size="icon"
      className="fixed right-4 bottom-4 z-50 size-11 rounded-full shadow-lg"
      onClick={() => setOpen(true)}
      title="Open agent"
    >
      <Sparkles className="size-5" />
      <span className="sr-only">Open agent</span>
    </Button>
  )
}
