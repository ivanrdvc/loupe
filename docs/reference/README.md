# Reference

Flat lookup tables. Scan for the row you need; the rest is irrelevant.
If you find yourself reading one of these top-to-bottom, it probably
wants to be in `explanation/` or `guides/` instead.

## Tables

- [AI / LLM trace attributes](ai-attributes.md) — OTel GenAI semconv plus the
  Logfire / OpenInference / vendor extensions seen in real traces. Lookup
  table for what each attribute key means when reading a span.
- [Telemetry providers](telemetry-providers.md) — how agentops reads spans
  from each backend (OpenObserve, Application Insights, …), the row → Span
  mapping, and the trace-scope post-processing every provider runs before
  returning data.
