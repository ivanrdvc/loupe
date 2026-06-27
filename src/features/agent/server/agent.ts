import { type InferAgentUIMessage, isStepCount, ToolLoopAgent } from 'ai'
import { z } from 'zod'
import { type ChatModelId, DEFAULT_CHAT_MODEL, isChatModelId } from '#/features/agent/chat-models'
import { resolveChatModel } from './models'
import { BASE, type MentionRef, type PageContext, requestInstructions } from './prompt'
import { loadSkillTool } from './skills'
import { agentTelemetry } from './telemetry'
import { agentTools, resolveMentions } from './tools'

const callOptionsSchema = z.object({
  context: z.custom<PageContext>().optional(),
  mentions: z.custom<MentionRef[]>().optional(),
  model: z.string().optional(),
  sessionId: z.string().optional(),
})

// Static identity here; per-request context, mentions, model, and telemetry come via prepareCall.
export const loupeAgent = new ToolLoopAgent({
  model: resolveChatModel(DEFAULT_CHAT_MODEL),
  instructions: BASE,
  tools: { ...agentTools, load_skill: loadSkillTool },
  stopWhen: isStepCount(8),
  // gpt-5 only streams a thinking summary when asked; keep effort low so it's quick.
  providerOptions: { openai: { reasoningSummary: 'auto', reasoningEffort: 'low' } },
  callOptionsSchema,
  prepareCall: async ({ options, ...settings }) => {
    const ctx = options.context ?? { pathname: '/' }
    const mentions = options.mentions?.length ? await resolveMentions(options.mentions) : undefined
    const modelId: ChatModelId = isChatModelId(options.model) ? options.model : DEFAULT_CHAT_MODEL
    return {
      ...settings,
      model: resolveChatModel(modelId),
      instructions: requestInstructions(ctx, mentions),
      telemetry: agentTelemetry(options.sessionId),
    }
  },
})

export type LoupeAgentUIMessage = InferAgentUIMessage<typeof loupeAgent>
