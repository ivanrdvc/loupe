export { toolTone } from './tone'

const PREFIXES = ['execute_tool ', 'tools/call ']

// Telemetry sometimes leaves the operation prefix on a tool's span name;
// strip it so every surface keys off the same display identity.
export function toolDisplayName(name: string): string {
  for (const p of PREFIXES) if (name.startsWith(p)) return name.slice(p.length)
  return name
}
