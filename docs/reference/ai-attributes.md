---
title: AI / LLM trace attributes
type: reference
summary: OTel GenAI semconv plus the Logfire / OpenInference / vendor
  extensions seen in real traces. Lookup table for what each
  attribute key means when reading a span.
status: stable
owner: "@ivan"
audience: anyone reading a span payload
last-reviewed: 2026-05-12
tags: [otel, gen-ai, ingest, attributes]
---

# AI / LLM trace attributes

OTel GenAI semconv plus the Logfire / OpenInference / vendor extensions seen in real instrumented agent traces. Use this as the lookup for what each key means when reading a span.

Spec: <https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/>

**Format note.** OTel emits attributes with dots (`gen_ai.request.model`); OpenObserve and similar backends flatten dots to underscores at ingest, so the same attribute reads back as `gen_ai_request_model`. The `gen_ai.*` tables below show the spec form; everywhere else (Logfire `llm_*`, OpenAI `openai_*`, AG-UI `ag_ui_*`) the keys never had dots — they are inherently underscored.

## Operation & provider

| Attribute               | Type   | Values                                                                                                                                                                     |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gen_ai.operation.name` | string | `chat`, `create_agent`, `embeddings`, `execute_tool`, `generate_content`, `invoke_agent`, `invoke_workflow`, `retrieval`, `text_completion`                                |
| `gen_ai.provider.name`  | string | `anthropic`, `aws.bedrock`, `azure.ai.openai`, `cohere`, `deepseek`, `gcp.gemini`, `gcp.vertex_ai`, `groq`, `ibm.watsonx.ai`, `mistral_ai`, `openai`, `perplexity`, `x_ai` |

### Utility LLM purpose (app-scoped)

| Attribute              | Type   | Values                                                                       |
| ---------------------- | ------ | ---------------------------------------------------------------------------- |
| `teammate.llm.purpose` | string | `title_generation`, `summarization`, `artifact_resolution` (or any freeform) |

Per [OTel naming spec](https://opentelemetry.io/docs/specs/semconv/general/attribute-naming/), application-specific attributes should **not** reuse the `gen_ai.*` namespace. Use `teammate.llm.purpose` to tag utility side-calls (title gen, artifact resolution, etc.). The span tree renders its value as a badge after the span name.

`gen_ai.operation.name` is set by the SDK instrumentation (e.g. MEAI's `OpenTelemetryChatClient`) and drives span classification — do **not** override it.

## Agent

| Attribute                  | Type   |
| -------------------------- | ------ |
| `gen_ai.agent.id`          | string |
| `gen_ai.agent.name`        | string |
| `gen_ai.agent.description` | string |
| `gen_ai.agent.version`     | string |

## Conversation & workflow

| Attribute                | Type   |
| ------------------------ | ------ |
| `gen_ai.conversation.id` | string |
| `gen_ai.workflow.name`   | string |

## Request

| Attribute                          | Type     |
| ---------------------------------- | -------- |
| `gen_ai.request.model`             | string   |
| `gen_ai.request.choice.count`      | int      |
| `gen_ai.request.max_tokens`        | int      |
| `gen_ai.request.temperature`       | double   |
| `gen_ai.request.top_p`             | double   |
| `gen_ai.request.top_k`             | double   |
| `gen_ai.request.frequency_penalty` | double   |
| `gen_ai.request.presence_penalty`  | double   |
| `gen_ai.request.seed`              | int      |
| `gen_ai.request.stop_sequences`    | string[] |
| `gen_ai.request.stream`            | boolean  |
| `gen_ai.request.encoding_formats`  | string[] |

## Response

| Attribute                             | Type     |
| ------------------------------------- | -------- |
| `gen_ai.response.id`                  | string   |
| `gen_ai.response.model`               | string   |
| `gen_ai.response.finish_reasons`      | string[] |
| `gen_ai.response.time_to_first_chunk` | double   |

## Messages

| Attribute                    | Type   | Values                            |
| ---------------------------- | ------ | --------------------------------- |
| `gen_ai.input.messages`      | any    |                                   |
| `gen_ai.output.messages`     | any    |                                   |
| `gen_ai.output.type`         | string | `text`, `json`, `image`, `speech` |
| `gen_ai.system_instructions` | any    |                                   |

## Usage / tokens

| Attribute                                  | Type   | Values            |
| ------------------------------------------ | ------ | ----------------- |
| `gen_ai.usage.input_tokens`                | int    |                   |
| `gen_ai.usage.output_tokens`               | int    |                   |
| `gen_ai.usage.cache_creation.input_tokens` | int    |                   |
| `gen_ai.usage.cache_read.input_tokens`     | int    |                   |
| `gen_ai.usage.reasoning.output_tokens`     | int    |                   |
| `gen_ai.token.type`                        | string | `input`, `output` |

## Tools

| Attribute                    | Type   | Values                               |
| ---------------------------- | ------ | ------------------------------------ |
| `gen_ai.tool.name`           | string |                                      |
| `gen_ai.tool.type`           | string | `function`, `extension`, `datastore` |
| `gen_ai.tool.description`    | string |                                      |
| `gen_ai.tool.definitions`    | any    |                                      |
| `gen_ai.tool.call.id`        | string |                                      |
| `gen_ai.tool.call.arguments` | any    |                                      |
| `gen_ai.tool.call.result`    | any    |                                      |

## Retrieval

| Attribute                     | Type   |
| ----------------------------- | ------ |
| `gen_ai.retrieval.query.text` | string |
| `gen_ai.retrieval.documents`  | any    |
| `gen_ai.data_source.id`       | string |

## Evaluation

| Attribute                       | Type   |
| ------------------------------- | ------ |
| `gen_ai.evaluation.name`        | string |
| `gen_ai.evaluation.score.value` | double |
| `gen_ai.evaluation.score.label` | string |
| `gen_ai.evaluation.explanation` | string |

## Embeddings

| Attribute                           | Type |
| ----------------------------------- | ---- |
| `gen_ai.embeddings.dimension.count` | int  |

## Prompts

| Attribute            | Type   |
| -------------------- | ------ |
| `gen_ai.prompt.name` | string |

## AG-UI (CopilotKit)

| Attribute                    | Type   |
| ---------------------------- | ------ |
| `ag_ui_forwarded_properties` | object |
| `ag_ui_run_id`               | string |
| `ag_ui_state`                | object |
| `ag_ui_thread_id`            | string |

## LLM (Logfire / flattened)

| Attribute                       | Type          | Values                                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llm_observation_type`          | string        | `GENERATION` on LLM spans                                                                                                                                                                                                                                                             |
| `llm_request_parameters_stream` | boolean       |                                                                                                                                                                                                                                                                                       |
| `llm_input`                     | string (JSON) | Full chat history sent to the model. Array of `{role, parts: [{type, content?, name?, arguments?, id?, response?}]}`. The `assistant` role can include `tool_call` parts and a `name` field identifying which agent produced it; the `tool` role contains `tool_call_response` parts. |
| `llm_output`                    | string (JSON) | Assistant's reply, same shape. Tool calls made this turn live in `parts` with `type: "tool_call"`.                                                                                                                                                                                    |
| `llm_usage_cost_input`          | double        |                                                                                                                                                                                                                                                                                       |
| `llm_usage_cost_output`         | double        |                                                                                                                                                                                                                                                                                       |
| `llm_usage_cost_total`          | double        |                                                                                                                                                                                                                                                                                       |
| `llm_usage_tokens_input`        | int           |                                                                                                                                                                                                                                                                                       |
| `llm_usage_tokens_output`       | int           |                                                                                                                                                                                                                                                                                       |
| `llm_usage_tokens_total`        | int           |                                                                                                                                                                                                                                                                                       |
| `operation_name`                | string        | e.g. `chat gpt-4o-mini`                                                                                                                                                                                                                                                               |

Because `llm_input` carries the full conversation, you can reconstruct the chat from a single LLM span — no need to merge across spans. Prefer `llm_usage_cost_total` over deriving from token counts when both are present (cost depends on model pricing the SDK already knows).

## OpenAI-specific

| Attribute                            | Type   | Values             |
| ------------------------------------ | ------ | ------------------ |
| `openai_api_type`                    | string | `chat_completions` |
| `openai_response_service_tier`       | string | `default`          |
| `openai_response_system_fingerprint` | string |                    |

## Span structural fields

Not attributes — these come from the OTel span itself. Listed here because OpenObserve exposes them as columns alongside the attribute bag.

| Field                                                   | Notes                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `trace_id`                                              | Same for every span in the run                               |
| `span_id`                                               | This span's id                                               |
| `reference_parent_span_id`                              | Parent span id (empty/null on root)                          |
| `reference_parent_trace_id`                             | Same as `trace_id`                                           |
| `reference_ref_type`                                    | `ChildOf` for the parent edge                                |
| `start_time`                                            | **Nanoseconds** since Unix epoch                             |
| `end_time`                                              | **Nanoseconds** since Unix epoch                             |
| `duration`                                              | **Microseconds** — units don't match start/end               |
| `_timestamp`                                            | OpenObserve ingest timestamp (microseconds)                  |
| `service_name`                                          | OTel `service.name` resource attribute                       |
| `service_telemetry_sdk_name` / `_language` / `_version` | OTel SDK info                                                |
| `span_kind`                                             | `1`–`5` for INTERNAL / SERVER / CLIENT / PRODUCER / CONSUMER |
| `span_status`                                           | `UNSET`, `OK`, `ERROR`                                       |
| `events` / `links`                                      | JSON arrays                                                  |
| `flags`                                                 | TraceFlags                                                   |

## Agent-as-tool pattern

When an orchestrator agent treats sub-agents as tools, the trace shape is:

```
invoke_agent <Orchestrator>
├─ chat <model>                  # turn 1 LLM call
├─ execute_tool <sub_agent_name> # turn 1 action — looks like a tool…
│  └─ invoke_agent <SubAgent>    # …but wraps a full agent run
│     └─ chat <model>
│        └─ POST                  # HTTP to provider
└─ chat <model>                   # turn 2 (final answer)
```

To detect "is this tool actually a sub-agent?" check whether the `execute_tool` span has an `invoke_agent` child. If yes, render it as an agent invocation and roll up tokens/cost from the entire wrapped subtree.

## Deprecated → current

| Deprecated                                  | Current                              |
| ------------------------------------------- | ------------------------------------ |
| `gen_ai.system`                             | `gen_ai.provider.name`               |
| `gen_ai.usage.prompt_tokens`                | `gen_ai.usage.input_tokens`          |
| `gen_ai.usage.completion_tokens`            | `gen_ai.usage.output_tokens`         |
| `gen_ai.openai.request.response_format`     | `gen_ai.output.type`                 |
| `gen_ai.openai.request.seed`                | `gen_ai.request.seed`                |
| `gen_ai.openai.request.service_tier`        | `openai.request.service_tier`        |
| `gen_ai.openai.response.service_tier`       | `openai.response.service_tier`       |
| `gen_ai.openai.response.system_fingerprint` | `openai.response.system_fingerprint` |
| `gen_ai.prompt`                             | (moved to Event API)                 |
| `gen_ai.completion`                         | (moved to Event API)                 |
