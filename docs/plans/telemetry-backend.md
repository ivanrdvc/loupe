# Telemetry backend

## Problem

loupe currently reads spans from Azure Application Insights via its REST query API. At ~10k sessions/day with full LLM I/O in span attributes, interactive views (session list, trace tree, span detail) are too slow for production use. The cause is AI's query API + federated schema with JSON probing, not the underlying engine.

We need a backend that:
- accepts OTLP ingest from agents
- supports fast keyed lookups (by `trace_id`, time range, session attributes) for span-tree and list queries
- feeds `classifySpan(name, attrs)` normalization in loupe via a new `TelemetryProvider`
- hosts on **Azure**
- holds **6–12 months** retention
- can be operated by a solo operator

Volume estimate: 200k spans/day, ~10KB avg → ~400MB/day compressed → ~75GB at 6mo, ~150GB at 12mo.

## Constraints

- License must be permissive (Apache 2.0 / MIT). No AGPL — rules out Grafana Tempo, OpenObserve OSS.
- Must run on Azure infra.
- No local mirror in loupe itself; reads stay live via providers in `src/lib/telemetry/`.
- Solo operator → ops burden must be light.

## Options considered

### 1. Azure Data Explorer (Kusto) + OTel Collector
- **Stack**: `opentelemetry-collector-contrib` on Azure Container Apps → `azuredataexplorerexporter` → ADX cluster
- **License**: Apache 2.0 (collector); Azure managed (ADX)
- **Cost**: $75–150/mo (Dev SKU) or ~$300/mo (Standard D11_v2 with SLA)
- **Pros**: zero VM ops; same KQL the team knows; auto hot/cold tiering keeps 12mo retention cheap; declarative retention/caching policies; streaming ingestion option on Standard
- **Cons**: Azure lock-in (KQL doesn't port); pricey at this small scale; Dev SKU has no SLA

### 2. Self-hosted ClickHouse on Azure VM
- **Stack**: `clickhouse/clickhouse-server` on a B2ms VM (2 vCPU burst, 8GB, 256GB SSD) + `clickhouseexporter` in collector contrib
- **License**: Apache 2.0 for both
- **Cost**: $65–95/mo all-in
- **Pros**: cheapest columnar option; portable off Azure; B-series burst credits fit loupe's spiky query load; mature exporter (ClickHouse Inc maintained); `TTL ... DELETE` handles retention declaratively
- **Cons**: you own OS patches, CH upgrades, backup-to-Blob cron, disk-fill monitoring; single VM = no HA; manual config if you want hot/cold tiering to Blob at 12mo

### 3. Azure Database for PostgreSQL Flexible Server + JSONB
- **Stack**: B1ms Postgres + thin collector receiver → Postgres writer (no first-class OTel Postgres trace exporter; ~50 lines of glue)
- **License**: Postgres (PostgreSQL License, permissive)
- **Cost**: $15–25/mo
- **Pros**: cheapest viable option; fully managed (backups, patches); familiar tooling; provider interface lets you swap to CH later without touching loupe
- **Cons**: not columnar — wide scans slow above ~10M rows (36M at 6mo is borderline); needs careful btree(`trace_id`) + GIN on attributes JSONB; no first-class OTel exporter means a small bespoke ingest service to maintain

### 4. Stay on Application Insights, hit ADX directly underneath
- **Stack**: keep AI ingest; bypass AI query API by cross-cluster-querying AI's underlying ADX from loupe
- **Cost**: $0 incremental (already paying for AI)
- **Pros**: no migration; cheapest possible path
- **Cons**: AI's schema isn't tuned for trace-tree queries; partial perf win at best; doesn't solve the root cause

## Recommendation

**Option 2: Self-hosted ClickHouse on a B2ms VM** with collector contrib's `clickhouseexporter`. Half the cost of ADX at this volume, same engine class, portable. Ops burden at 200k spans/day on a single node is genuinely light — backup cron, TTL policy, one disk-fill alert.

Fall back to **Option 1 (ADX)** if ops-by-anyone-other-than-Ivan becomes a requirement, or **Option 3 (Postgres)** if cost matters more than query latency for the next 12 months.

## Open questions

- What's the actual avg span size? LLM-heavy spans can be 50–200KB — re-do sizing with a real sample from current AI data before provisioning.
- 6mo or 12mo retention? Default 6mo; extend later (ClickHouse `TTL` is a one-line change).
- Need HA? Single-VM CH has none. Acceptable for loupe?
- Cutover plan: dual-write OTLP for ~1–2 weeks, hard cut reads, decommission AI.
