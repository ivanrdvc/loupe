import { useQuery } from '@tanstack/react-query'
import type { Span } from '#/lib/spans'
import { type ChatBreakdown, emptyBreakdown, sumBreakdowns } from '#/lib/tokens'
import { fetchBreakdowns } from '#/server/breakdowns'

export function useBreakdowns(
  chatSpans: Span[],
  options: { enabled?: boolean } = {},
): { ready: boolean; total: ChatBreakdown } {
  const enabled = options.enabled ?? true
  const ids = chatSpans.map((s) => s.id).join(',')

  const { data, isPending } = useQuery({
    queryKey: ['breakdowns', ids],
    queryFn: () =>
      fetchBreakdowns({
        data: chatSpans.map(({ model, llmInput, inputTokens, outputTokens, cachedTokens, toolDefinitions }) => ({
          model,
          llmInput,
          inputTokens,
          outputTokens,
          cachedTokens,
          toolDefinitions,
        })),
      }),
    enabled: enabled && chatSpans.length > 0,
    staleTime: Infinity,
  })

  return {
    ready: !isPending,
    total: data ? sumBreakdowns(data) : emptyBreakdown(),
  }
}
