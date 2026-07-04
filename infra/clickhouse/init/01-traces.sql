-- Base columns must match the clickhouseexporter v0.120.0 INSERT shape exactly
-- (create_schema=false in otel-collector.yaml). Everything below the Links
-- column is loupe's: promoted columns MATERIALIZED from the attr maps so hot
-- queries (lists, aggregates, facets) never probe a Map. Attribute alias lists
-- mirror ATTRS in src/lib/telemetry/conventions.ts — keep them in sync.

CREATE DATABASE IF NOT EXISTS loupe;

CREATE TABLE IF NOT EXISTS loupe.otel_traces (
    Timestamp DateTime64(9) CODEC(Delta, ZSTD(1)),
    TraceId String CODEC(ZSTD(1)),
    SpanId String CODEC(ZSTD(1)),
    ParentSpanId String CODEC(ZSTD(1)),
    TraceState String CODEC(ZSTD(1)),
    SpanName LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName String CODEC(ZSTD(1)),
    ScopeVersion String CODEC(ZSTD(1)),
    SpanAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration UInt64 CODEC(ZSTD(1)),
    StatusCode LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage String CODEC(ZSTD(1)),
    Events Nested (
        Timestamp DateTime64(9),
        Name LowCardinality(String),
        Attributes Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),
    Links Nested (
        TraceId String,
        SpanId String,
        TraceState String,
        Attributes Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),

    SessionId String MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['ag_ui.thread_id'],
        SpanAttributes['session.id'],
        SpanAttributes['gen_ai.conversation.id'],
        SpanAttributes['langfuse.session.id'],
        SpanAttributes['openinference.session.id']
    ]) CODEC(ZSTD(1)),
    SessionTitle String MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['ag_ui.thread.title'],
        SpanAttributes['session.title'],
        SpanAttributes['thread.title'],
        SpanAttributes['gen_ai.conversation.title']
    ]) CODEC(ZSTD(1)),
    UserId String MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['user.id'],
        SpanAttributes['enduser.id'],
        SpanAttributes['ag_ui.user.id']
    ]) CODEC(ZSTD(1)),
    UserName String MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['user.name'],
        SpanAttributes['enduser.name']
    ]) CODEC(ZSTD(1)),
    Host LowCardinality(String) MATERIALIZED arrayFirst(v -> v != '', [
        ResourceAttributes['host.name'],
        SpanAttributes['host.name']
    ]) CODEC(ZSTD(1)),
    AgentName LowCardinality(String) MATERIALIZED SpanAttributes['gen_ai.agent.name'] CODEC(ZSTD(1)),
    Model LowCardinality(String) MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.request.model'],
        SpanAttributes['gen_ai.response.model']
    ]) CODEC(ZSTD(1)),
    GenAiOperation LowCardinality(String) MATERIALIZED SpanAttributes['gen_ai.operation.name'] CODEC(ZSTD(1)),
    Purpose LowCardinality(String) MATERIALIZED SpanAttributes['gen_ai.operation.purpose'] CODEC(ZSTD(1)),
    InputTokens UInt64 MATERIALIZED toUInt64(round(toFloat64OrZero(arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.usage.input_tokens'],
        SpanAttributes['llm.usage.tokens_input']
    ])))),
    OutputTokens UInt64 MATERIALIZED toUInt64(round(toFloat64OrZero(arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.usage.output_tokens'],
        SpanAttributes['llm.usage.tokens_output']
    ])))),
    TotalTokens UInt64 MATERIALIZED toUInt64(round(toFloat64OrZero(arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.usage.total_tokens'],
        SpanAttributes['llm.usage.tokens_total']
    ])))),
    CacheReadTokens UInt64 MATERIALIZED toUInt64(round(toFloat64OrZero(arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.usage.cache_read.input_tokens'],
        SpanAttributes['gen_ai.usage.cache_read_input_tokens'],
        SpanAttributes['llm.usage.cache_read_tokens']
    ])))),
    -- Emitted cost wins; otherwise derive it from tokens × per-token price via the
    -- model_prices dictionary (fed from @pydantic/genai-prices) — computed ONCE at
    -- ingest and stored, so list queries SUM a float instead of re-pricing per row.
    -- Uncached input = InputTokens - CacheReadTokens (matches genai-prices' split).
    CostUsd Float64 MATERIALIZED if(
        toFloat64OrZero(arrayFirst(v -> v != '', [
            SpanAttributes['gen_ai.usage.cost_total'],
            SpanAttributes['gen_ai.usage.cost'],
            SpanAttributes['llm.usage.cost_total']
        ])) > 0,
        toFloat64OrZero(arrayFirst(v -> v != '', [
            SpanAttributes['gen_ai.usage.cost_total'],
            SpanAttributes['gen_ai.usage.cost'],
            SpanAttributes['llm.usage.cost_total']
        ])),
        greatest(toFloat64(InputTokens) - toFloat64(CacheReadTokens), 0)
            * dictGetFloat64('loupe.model_prices', 'input_ppt', (arrayFirst(v -> v != '', [SpanAttributes['gen_ai.provider.name'], SpanAttributes['gen_ai.system']]), toString(Model)))
        + toFloat64(CacheReadTokens)
            * dictGetFloat64('loupe.model_prices', 'cache_read_ppt', (arrayFirst(v -> v != '', [SpanAttributes['gen_ai.provider.name'], SpanAttributes['gen_ai.system']]), toString(Model)))
        + toFloat64(OutputTokens)
            * dictGetFloat64('loupe.model_prices', 'output_ppt', (arrayFirst(v -> v != '', [SpanAttributes['gen_ai.provider.name'], SpanAttributes['gen_ai.system']]), toString(Model)))
    ),
    TriggerType LowCardinality(String) MATERIALIZED SpanAttributes['session.trigger_type'] CODEC(ZSTD(1)),
    Execution LowCardinality(String) MATERIALIZED SpanAttributes['session.execution'] CODEC(ZSTD(1)),
    TaskParentId String MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.task.parent.id'],
        SpanAttributes['graph.node.parent_id']
    ]) CODEC(ZSTD(1)),
    TaskId String MATERIALIZED SpanAttributes['task.id'] CODEC(ZSTD(1)),
    TaskKind LowCardinality(String) MATERIALIZED SpanAttributes['task.kind'] CODEC(ZSTD(1)),
    TaskSchedule String MATERIALIZED SpanAttributes['task.schedule'] CODEC(ZSTD(1)),
    TaskName String MATERIALIZED SpanAttributes['task.name'] CODEC(ZSTD(1)),
    TaskSource LowCardinality(String) MATERIALIZED SpanAttributes['task.source'] CODEC(ZSTD(1)),
    ToolResultChars UInt32 MATERIALIZED toUInt32(length(SpanAttributes['gen_ai.tool.call.result'])),
    DeploymentEnv LowCardinality(String) MATERIALIZED arrayFirst(v -> v != '', [
        ResourceAttributes['deployment.environment'],
        SpanAttributes['deployment.environment']
    ]) CODEC(ZSTD(1)),
    Provider LowCardinality(String) MATERIALIZED arrayFirst(v -> v != '', [
        SpanAttributes['gen_ai.provider.name'],
        SpanAttributes['gen_ai.system']
    ]) CODEC(ZSTD(1)),
    -- First user text extracted at ingest so list queries never read the
    -- messages body. Best-effort over semconv parts / content parts / string
    -- content; 200 chars matches FIRST_INPUT_MAX_CHARS in shared.ts.
    FirstInputPreview String MATERIALIZED leftUTF8(coalesce(
        nullIf(JSONExtractString(arrayFirst(p -> JSONExtractString(p, 'type') = 'text',
            JSONExtractArrayRaw(arrayFirst(m -> JSONExtractString(m, 'role') = 'user',
                JSONExtractArrayRaw(arrayFirst(v -> v != '', [SpanAttributes['gen_ai.input.messages'], SpanAttributes['llm.input']]))), 'parts')), 'content'), ''),
        nullIf(JSONExtractString(arrayFirst(p -> JSONExtractString(p, 'type') IN ('text', 'input_text'),
            JSONExtractArrayRaw(arrayFirst(m -> JSONExtractString(m, 'role') = 'user',
                JSONExtractArrayRaw(arrayFirst(v -> v != '', [SpanAttributes['gen_ai.input.messages'], SpanAttributes['llm.input']]))), 'content')), 'text'), ''),
        nullIf(JSONExtractString(arrayFirst(m -> JSONExtractString(m, 'role') = 'user',
            JSONExtractArrayRaw(arrayFirst(v -> v != '', [SpanAttributes['gen_ai.input.messages'], SpanAttributes['llm.input']]))), 'content'), ''),
        ''), 200) CODEC(ZSTD(1)),

    -- Time-ordered narrow copy (no attr maps, no events) for list queries.
    PROJECTION proj_time (
        SELECT Timestamp, TraceId, SpanId, ParentSpanId, SpanName, SpanKind, ServiceName, Duration, StatusCode,
               SessionId, SessionTitle, UserId, UserName, Host, AgentName, Model, Provider, GenAiOperation, Purpose,
               InputTokens, OutputTokens, TotalTokens, CacheReadTokens, CostUsd, TriggerType, Execution,
               TaskParentId, TaskId, TaskKind, TaskSchedule, TaskName, TaskSource, ToolResultChars, DeploymentEnv,
               FirstInputPreview
        ORDER BY (Timestamp, TraceId)
    ),

    INDEX idx_timestamp Timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_span_id SpanId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id SessionId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_duration Duration TYPE minmax GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (Host, ServiceName, TraceId, toDateTime(Timestamp))
TTL toDateTime(Timestamp) + toIntervalDay(180)
-- Vertical merges (column-by-column) keep merge memory flat despite the wide row + fat attr maps.
SETTINGS index_granularity = 8192, index_granularity_bytes = 67108864, ttl_only_drop_parts = 1,
    vertical_merge_algorithm_min_rows_to_activate = 1024, vertical_merge_algorithm_min_columns_to_activate = 1;


-- ── Per-trace summary ─────────────────────────────────────────────────────────
-- Time window + span count per trace. getTrace resolves the window here so the
-- span fetch prunes partitions instead of scanning a 30-day default. Commutative
-- aggregates (spans are immutable) → read as plain values, no FINAL.
-- Backfill when attaching to existing data (init runs only on a fresh volume):
--   INSERT INTO loupe.trace_summary SELECT TraceId, min(Timestamp), max(Timestamp), toUInt64(count()) FROM loupe.otel_traces GROUP BY TraceId;

CREATE TABLE IF NOT EXISTS loupe.trace_summary (
    trace_id  String CODEC(ZSTD(1)),
    start     SimpleAggregateFunction(min, DateTime64(9)) CODEC(ZSTD(1)),
    end       SimpleAggregateFunction(max, DateTime64(9)) CODEC(ZSTD(1)),
    num_spans SimpleAggregateFunction(sum, UInt64) CODEC(ZSTD(1))
) ENGINE = AggregatingMergeTree
PARTITION BY toDate(end)
ORDER BY (trace_id)
TTL toDateTime(end) + toIntervalDay(180)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS loupe.trace_summary_mv TO loupe.trace_summary AS
SELECT
    TraceId AS trace_id,
    min(Timestamp) AS start,
    max(Timestamp) AS end,
    toUInt64(count()) AS num_spans
FROM loupe.otel_traces
GROUP BY TraceId;


-- ── Trace list (domain rules, defined once) ───────────────────────────────────
-- Per-trace derivation (root op, primary agent, trigger, error, task fields) as a
-- parameterized view so the provider query and any future rollup MV share one
-- source of truth. listTraces selects `FROM trace_list(...)`, layers facet
-- filters, and maps rows — no domain SQL in TS.
--
-- Identity/root columns use argMinIf(x, Timestamp, cond) = "the value from the
-- earliest span matching cond", NOT max(x): max(String) picks the
-- lexicographically-largest value, wrong whenever a trace has >1 distinct value
-- (e.g. several agents). Plain max() is kept only for trace-constant fields
-- (session/user/service) and booleans/sums, where '' sorts below any real value.
--
-- Validated 2026-07-02 against the live 843k-span / 84k-trace dataset: identical
-- to the previous maxIf-based query on every trace (0 diffs on
-- agent/root_op/trigger/error/tokens), 103ms for a full-range LIMIT 50 page.
-- argMinIf diverges from maxIf only on traces with >1 distinct agent name, which
-- that dataset happens not to contain — re-check on production data that has
-- multi-agent/sub-agent traces before relying on the divergence.

CREATE VIEW IF NOT EXISTS loupe.trace_list AS
SELECT
    TraceId AS trace_id,
    min(toUnixTimestamp64Milli(Timestamp)) AS first_ms,
    max(toUnixTimestamp64Milli(Timestamp) + intDiv(Duration, 1000000)) AS last_ms,
    count() AS span_count,
    sumIf(if(TotalTokens > 0, TotalTokens, InputTokens + OutputTokens), GenAiOperation = 'chat') AS total_tokens,
    sumIf(CostUsd, GenAiOperation = 'chat') AS total_cost,
    argMinIf(SpanName, Timestamp, SpanName LIKE 'invoke_agent %') AS sample_agent,
    argMinIf(AgentName, Timestamp, SpanName LIKE 'invoke_agent %') AS sample_agent_name,
    max(toUInt8(StatusCode IN ('Error', 'STATUS_CODE_ERROR')
        AND (GenAiOperation != '' OR SpanName LIKE 'invoke_agent %' OR SpanName LIKE 'execute_tool %'))) AS has_error,
    max(SessionId) AS session_id,
    max(ServiceName) AS service_name,
    max(SpanName LIKE 'invoke_agent %') AS has_invoke_agent,
    max(GenAiOperation = 'chat') AS has_chat,
    argMinIf(Purpose, Timestamp, ParentSpanId = '' AND Purpose != '') AS root_llm_purpose,
    -- root value, falling back to the invoke_agent span when the root has none.
    if(argMinIf(TriggerType, Timestamp, ParentSpanId = '' AND TriggerType != '') != '',
       argMinIf(TriggerType, Timestamp, ParentSpanId = '' AND TriggerType != ''),
       argMinIf(TriggerType, Timestamp, SpanName LIKE 'invoke_agent %' AND TriggerType != '')) AS root_trigger_type,
    if(argMinIf(Execution, Timestamp, ParentSpanId = '' AND Execution != '') != '',
       argMinIf(Execution, Timestamp, ParentSpanId = '' AND Execution != ''),
       argMinIf(Execution, Timestamp, SpanName LIKE 'invoke_agent %' AND Execution != '')) AS root_execution,
    argMinIf(TaskId, Timestamp, ParentSpanId = '' AND TaskId != '') AS root_task_id,
    argMinIf(TaskKind, Timestamp, ParentSpanId = '' AND TaskKind != '') AS root_task_kind,
    argMinIf(TaskSchedule, Timestamp, ParentSpanId = '' AND TaskSchedule != '') AS root_task_schedule,
    argMinIf(TaskName, Timestamp, ParentSpanId = '' AND TaskName != '') AS root_task_name,
    argMinIf(TaskSource, Timestamp, ParentSpanId = '' AND TaskSource != '') AS root_task_source,
    argMinIf(SpanName, Timestamp, ParentSpanId = '') AS root_operation,
    max(UserId) AS trace_user_id,
    max(UserName) AS trace_user_name
FROM loupe.otel_traces
WHERE (GenAiOperation != ''
   OR SpanName LIKE 'invoke_agent %'
   OR SpanName LIKE 'execute_tool %'
   OR TriggerType != ''
   OR Purpose != '')
  AND SpanName NOT LIKE 'tools/%'
  AND Timestamp >= fromUnixTimestamp64Micro({p_from:Int64})
  AND Timestamp < fromUnixTimestamp64Micro({p_to:Int64})
  AND ({p_svc:String} = '' OR ServiceName = {p_svc:String})
GROUP BY TraceId;


-- ── Model prices (backs cost computation in the list views) ───────────────────
-- LLM cost isn't in the OTel GenAI semconv — SDKs emit tokens, the backend
-- derives cost (as Langfuse/OpenObserve/Phoenix all do). loupe's price source is
-- @pydantic/genai-prices; infra/clickhouse/price-sync.mjs resolves the per-token
-- price of every (provider, model) present in otel_traces via that lib and loads
-- the result here, so the lib stays the single source of truth. The list views
-- read it with dictGet to compute cost in SQL (→ sortable/filterable), matching
-- the read-time estimateCostUsd exactly. Empty on a fresh volume until the sync
-- job runs; unknown models dictGet to 0 (same as the JS path returning undefined).
CREATE TABLE IF NOT EXISTS loupe.model_prices_src (
    provider       LowCardinality(String),
    model          String,
    input_ppt      Float64,
    output_ppt     Float64,
    cache_read_ppt Float64,
    updated        DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated)
ORDER BY (provider, model);

CREATE DICTIONARY IF NOT EXISTS loupe.model_prices (
    provider       String,
    model          String,
    input_ppt      Float64,
    output_ppt     Float64,
    cache_read_ppt Float64
) PRIMARY KEY provider, model
SOURCE(CLICKHOUSE(DB 'loupe' TABLE 'model_prices_src' USER 'loupe' PASSWORD 'loupe'))
LAYOUT(COMPLEX_KEY_HASHED())
LIFETIME(MIN 300 MAX 600);


-- ── Session list (session = producer-declared conversation grouping) ──────────
-- Aggregates traces into sessions entirely in SQL — replaces the JS
-- aggregateSessions() + SESSION_SCAN_LIMIT overfetch. Two-level: per_trace rolls
-- each trace up (same row-set contract as listSessions' scan), then the outer
-- SELECT groups traces by SessionId. Mirrors aggregateSessions semantics:
--   • source must be 'attribute' — a trace with no session attr falls back to
--     its own id and is dropped here (has_session_attr filter); those belong on
--     the Runs page, not Sessions.
--   • drop sessions with no user-facing trace (all event/scheduled) — HAVING.
--   • title/user/host = value from the latest-ending trace that has one
--     (argMaxIf on end_ms); first_input = earliest-starting trace's (argMinIf).
--   • has_error flags AI-op or session-root error spans only.
-- Cost mirrors estimateCostUsd (the read-time JS path): emitted CostUsd wins;
-- otherwise it's derived from tokens × per-token price via the model_prices
-- dictionary (kept in sync from @pydantic/genai-prices by infra/clickhouse/
-- price-sync.mjs). Computing it here — not in JS post-query — is what makes cost
-- sortable/filterable server-side.
CREATE VIEW IF NOT EXISTS loupe.session_list AS
WITH per_trace AS (
    SELECT
        TraceId AS trace_id,
        max(SessionId) AS session_id,
        max(SessionId != '') AS has_session_attr,
        min(toUnixTimestamp64Milli(Timestamp)) AS start_ms,
        max(toUnixTimestamp64Milli(Timestamp) + intDiv(Duration, 1000000)) AS end_ms,
        sumIf(if(TotalTokens > 0, TotalTokens, InputTokens + OutputTokens), GenAiOperation = 'chat') AS tokens,
        sumIf(CostUsd, GenAiOperation = 'chat') AS cost,
        max(toUInt8(StatusCode IN ('Error', 'STATUS_CODE_ERROR')
            AND (GenAiOperation != '' OR SpanName LIKE 'invoke_agent %'
                 OR SpanName LIKE 'execute_tool %' OR SessionId != ''))) AS has_error,
        max(TriggerType) AS trigger_type,
        max(SessionTitle) AS title,
        max(UserName) AS user_name,
        max(UserId) AS user_id,
        if(max(Host) != '', max(Host), max(ServiceName)) AS host,
        argMinIf(FirstInputPreview, Timestamp, GenAiOperation = 'chat' AND FirstInputPreview != '') AS first_input,
        groupUniqArrayIf(
            if(AgentName != '', AgentName, extract(SpanName, '^invoke_agent\\s+([^(\\s]+)')),
            (AgentName != '') OR (SpanName LIKE 'invoke_agent %')
        ) AS agents
    FROM loupe.otel_traces
    WHERE (SpanName LIKE 'invoke_agent %'
        OR GenAiOperation = 'chat'
        OR (StatusCode IN ('Error', 'STATUS_CODE_ERROR') AND (GenAiOperation != '' OR SpanName LIKE 'execute_tool %'))
        OR SessionId != '')
      AND Timestamp >= fromUnixTimestamp64Micro({p_from:Int64})
      AND Timestamp < fromUnixTimestamp64Micro({p_to:Int64})
      AND ({p_svc:String} = '' OR ServiceName = {p_svc:String})
    GROUP BY TraceId
)
SELECT
    session_id,
    min(start_ms) AS first_ms,
    max(end_ms) AS last_ms,
    sum(greatest(end_ms - start_ms, 0)) AS active_ms,
    count() AS trace_count,
    sum(tokens) AS total_tokens,
    sum(cost) AS total_cost,
    max(has_error) AS has_error,
    argMaxIf(title, end_ms, title != '') AS title,
    argMaxIf(user_name, end_ms, user_name != '') AS user_name,
    argMaxIf(user_id, end_ms, user_id != '') AS user_id,
    argMaxIf(host, end_ms, host != '') AS host,
    argMinIf(first_input, start_ms, first_input != '') AS first_input,
    arrayDistinct(arrayFlatten(groupArray(agents))) AS agents
FROM per_trace
WHERE has_session_attr
GROUP BY session_id
HAVING countIf(trigger_type = '' OR trigger_type = 'user') > 0;
