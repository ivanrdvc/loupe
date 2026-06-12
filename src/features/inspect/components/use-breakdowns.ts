import { useQuery } from '@tanstack/react-query'
import { type ChatBreakdown, emptyBreakdown, sumBreakdowns } from '#/features/inspect/logic/tokens'
import { fetchBreakdowns } from '#/features/inspect/server/breakdowns'
import type { Span } from '#/lib/spans'

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
        data: chatSpans.map(
          ({ model, llmInput, inputTokens, outputTokens, cachedTokens, toolDefinitions, systemInstructions }) => ({
            model,
            llmInput,
            inputTokens,
            outputTokens,
            cachedTokens,
            toolDefinitions,
            systemInstructions,
          }),
        ),
      }),
    enabled: enabled && chatSpans.length > 0,
    staleTime: Infinity,
  })

  return {
    ready: !isPending,
    total: data ? sumBreakdowns(data) : emptyBreakdown(),
  }
}
