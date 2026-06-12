import type { LiveFilter } from '#/lib/eval/evaluation'
import type { TraceSummary } from '#/lib/telemetry/types'

export type { LiveFilter }

export function parseLiveFilter(raw: unknown): LiveFilter {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const f: LiveFilter = {}
  if (typeof o.sampleRate === 'number' && Number.isFinite(o.sampleRate)) {
    f.sampleRate = Math.min(1, Math.max(0, o.sampleRate))
  }
  if (typeof o.serviceName === 'string' && o.serviceName.trim()) f.serviceName = o.serviceName.trim()
  if (typeof o.agentName === 'string' && o.agentName.trim()) f.agentName = o.agentName.trim()
  return Object.keys(f).length > 0 ? f : null
}

export function matchesLiveFilter(trace: Pick<TraceSummary, 'serviceName' | 'agent'>, filter: LiveFilter): boolean {
  if (!filter) return true
  if (filter.serviceName && trace.serviceName !== filter.serviceName) return false
  if (filter.agentName && trace.agent !== filter.agentName) return false
  return true
}

export function sampleRateOf(filter: LiveFilter): number {
  const r = filter?.sampleRate
  return typeof r === 'number' ? Math.min(1, Math.max(0, r)) : 1
}
