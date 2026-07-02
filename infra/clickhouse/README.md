# ClickHouse telemetry backend (local)

Design: `plans/telemetry-backend.md`.

```sh
docker compose up -d
```

- OTLP ingest: grpc `localhost:4317`, http `localhost:4318` (point agents' `OTEL_EXPORTER_OTLP_ENDPOINT` here)
- ClickHouse: http `localhost:8123`, native `localhost:9000` — db/user/pass `loupe`/`loupe`/`loupe`

loupe reads it with `TELEMETRY_PROVIDER=clickhouse` (envs `CLICKHOUSE_URL`, `CLICKHOUSE_DB`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASS` default to the values above).

Memory: `config.d/memory.xml` + `mem_limit` are sized for a small local Docker VM (~2GB) — raise both on bigger hosts. Merges run column-by-column (vertical) so the wide row + fat attr maps don't spike merge memory.

Invariants:

- The collector image tag is pinned; `init/01-traces.sql` base columns must match that version's `clickhouseexporter` INSERT shape (`create_schema: false`). Bump both together.
- Promoted-column attr alias lists mirror `ATTRS` in `src/lib/telemetry/conventions.ts`. New alias → both places.
- Schema changes: init scripts only run on a fresh volume (`docker compose down -v` to reset), or apply `ALTER TABLE` manually. Materialized columns backfill only on merge — `ALTER TABLE ... MATERIALIZE COLUMN` for existing data.
