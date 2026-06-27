import { useAgent } from './agent-provider'

/**
 * Bottom-right launcher, ported from performative-ui's ChatFAB: dark glassy
 * fill, violet glow, twinkling gradient ✦. Icon-only. Hidden while open.
 */
export function AgentLauncher() {
  const { enabled, open, setOpen } = useAgent()
  if (!enabled || open) return null
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Ask AI"
      aria-expanded={false}
      className="fixed right-5 bottom-5 z-50 grid size-10 place-items-center rounded-full border border-white/10 bg-neutral-900/90 text-white shadow-[0_6px_24px_rgba(0,0,0,0.35),0_0_0_1px_rgba(124,58,237,0.25),0_0_28px_rgba(124,58,237,0.35)] backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      <span className="gradient-text animate-twinkle text-base leading-none font-bold" aria-hidden>
        ✦
      </span>
    </button>
  )
}
