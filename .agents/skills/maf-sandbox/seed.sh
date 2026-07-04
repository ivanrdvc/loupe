#!/usr/bin/env bash
# Seed loupe's ClickHouse backend with real gen_ai telemetry via the MAF sandbox.
# Points the sandbox's OTLP exporter at the CH collector (:4318) instead of OpenObserve,
# then fires ~55 conversations (1-3 turns each) with varied shapes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FIRE="$HERE/fire.py"

export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:4318/v1/traces"
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="http://localhost:4318/v1/metrics"
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="http://localhost:4318/v1/logs"
export OTEL_EXPORTER_OTLP_HEADERS=" "   # drop the OpenObserve auth header

# Kill any stale sandbox (likely pointed at OpenObserve), then warm up a fresh one
# with the CH endpoint before firing anything in parallel (avoids a spawn race).
pkill -f "maf.py" 2>/dev/null || true
sleep 1
"$FIRE" "warmup: say ready" --conversation "seed-warmup" >/dev/null 2>&1 || true

# Single-turn prompts (one trace each), chosen to exercise different telemetry shapes.
SINGLE=(
  "add 17 and 25"
  "multiply 8 by 9 then add 3"
  "give me a random number between 1 and 100"
  "echo back: hello world"
  "look up user 42"
  "list five fruits"
  "weather in Tokyo, Paris and New York at once"
  "what's the weather in Berlin?"
  "roll two dice via mcp"
  "flip a coin using mcp"
  "translate 'good morning' to French via mcp"
  "search the docs for 'retention' via mcp"
  "what's the current time via mcp?"
  "search my memory for anything about databases"
  "recall what you know about vector search"
  "fail_sometimes with probability 0.7"
  "fail_sometimes with probability 0.4"
  "load the files tools and read a file"
  "load math utilities and give me factorial of 6"
  "schedule a task to say hi in 2 seconds"
)

# Multi-turn conversation seeds (each inner turn is a separate trace in one session).
declare -a CONVOS=(
  "My name is Ada and I prefer tea|What's my name?|What do I prefer to drink?"
  "I'm Grace, I'm 31|How old am I?"
  "Remember I work on databases|What do I work on?|Recommend a tool for that"
  "weather in London please|and Madrid?|now compare the two"
  "add 2 and 2|multiply that by 10"
  "roll a die|roll again and add them"
  "look up user 7|now list items"
  "translate hello to Spanish|now to German"
)

pids=()
run_convo() {  # turns separated by |
  local conv="seed-$1"; shift
  local IFS='|'; read -ra turns <<<"$1"
  for t in "${turns[@]}"; do
    "$FIRE" "$t" --conversation "$conv" >/dev/null 2>&1 || true
  done
}

i=0
# Multi-turn sessions (sequential turns, parallel across sessions in small batches)
for spec in "${CONVOS[@]}"; do
  run_convo "conv-$i" "$spec" &
  pids+=($!); i=$((i+1))
  (( ${#pids[@]} >= 4 )) && { wait "${pids[0]}"; pids=("${pids[@]:1}"); }
done

# Single-turn sessions — unique conversation id each → its own session
for p in "${SINGLE[@]}"; do
  ( "$FIRE" "$p" --conversation "seed-single-$i" >/dev/null 2>&1 || true ) &
  pids+=($!); i=$((i+1))
  (( ${#pids[@]} >= 4 )) && { wait "${pids[0]}"; pids=("${pids[@]:1}"); }
done

# A few extra one-offs with fresh ids to pad session count past 50
for n in $(seq 1 30); do
  ( "$FIRE" "seed filler run number $n: add $n and $((n*2))" --conversation "seed-fill-$i" >/dev/null 2>&1 || true ) &
  pids+=($!); i=$((i+1))
  (( ${#pids[@]} >= 4 )) && { wait "${pids[0]}"; pids=("${pids[@]:1}"); }
done

wait
echo "fired $i sessions"
