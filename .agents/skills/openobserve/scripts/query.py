#!/usr/bin/env python3
"""Query a local OpenObserve instance for traces.

Defaults match the docker image's out-of-the-box admin (root@example.com /
Complexpass#123) and `default` org/stream. Override via env vars:
OO_BASE_URL, OO_ORG, OO_STREAM, OO_USER, OO_PASS.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULTS = {
    "base_url": os.environ.get("OO_BASE_URL", "http://localhost:5080"),
    "org": os.environ.get("OO_ORG", "default"),
    "stream": os.environ.get("OO_STREAM", "default"),
    "user": os.environ.get("OO_USER", "root@example.com"),
    "password": os.environ.get("OO_PASS", "Complexpass#123"),
}


def _auth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def _search(sql: str, start_us: int, end_us: int, *, size: int = 1000,
            search_type: str = "traces") -> dict:
    body = {
        "query": {
            "sql": sql,
            "start_time": start_us,
            "end_time": end_us,
            "from": 0,
            "size": size,
        }
    }
    url = f"{DEFAULTS['base_url']}/api/{DEFAULTS['org']}/_search?type={search_type}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": _auth_header(DEFAULTS["user"], DEFAULTS["password"]),
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.stderr.write(f"HTTP {e.code} from {url}\n{body}\n")
        sys.exit(2)


def _now_us() -> int:
    return int(time.time() * 1_000_000)


def _wide_window() -> tuple[int, int]:
    """A 30-day window ending 'now' — wide enough to find any recent trace."""
    end = _now_us()
    start = end - 30 * 24 * 60 * 60 * 1_000_000
    return start, end


def _tree_summary(hits: list[dict]) -> str:
    """Render hits as an indented operation tree.

    Children sorted by start_time; root is the span with no
    reference_parent_span_id present in the hit set.
    """
    by_parent: dict[str | None, list[dict]] = {}
    ids = {h.get("span_id") for h in hits}
    for h in hits:
        parent = h.get("reference_parent_span_id") or None
        # If parent isn't in this hit set, treat span as a root.
        if parent and parent not in ids:
            parent = None
        by_parent.setdefault(parent, []).append(h)
    for arr in by_parent.values():
        arr.sort(key=lambda h: h.get("start_time", 0))

    lines: list[str] = []

    def fmt(h: dict) -> str:
        op = h.get("operation_name", "?")
        dur_us = h.get("duration", 0)
        dur = f"{dur_us / 1000:.1f}ms" if dur_us < 1_000_000 else f"{dur_us / 1_000_000:.2f}s"
        tokens = h.get("llm_usage_tokens_total")
        cost = h.get("llm_usage_cost_total")
        extras: list[str] = []
        if tokens:
            extras.append(f"{tokens} tok")
        if cost and cost > 0:
            extras.append(f"${cost:.6f}")
        extras.append(dur)
        return f"{op}  [{', '.join(extras)}]"

    def walk(parent_id: str | None, depth: int) -> None:
        for h in by_parent.get(parent_id, []):
            lines.append("  " * depth + "- " + fmt(h))
            walk(h.get("span_id"), depth + 1)

    walk(None, 0)
    return "\n".join(lines)


def cmd_trace(args: argparse.Namespace) -> None:
    start_us = args.start_time
    end_us = args.end_time
    if start_us is None or end_us is None:
        start_us, end_us = _wide_window()
    sql = f"SELECT * FROM \"{DEFAULTS['stream']}\" WHERE trace_id='{args.trace_id}'"
    result = _search(sql, start_us, end_us, size=args.size)
    hits = result.get("hits", [])
    if args.summary:
        print(_tree_summary(hits))
        print(f"\n({len(hits)} spans)")
        return
    print(json.dumps(result, indent=2))


def cmd_search(args: argparse.Namespace) -> None:
    start_us = args.start_time
    end_us = args.end_time
    if start_us is None or end_us is None:
        start_us, end_us = _wide_window()
    result = _search(args.sql, start_us, end_us, size=args.size, search_type=args.type)
    if args.summary and args.type == "traces":
        print(_tree_summary(result.get("hits", [])))
        return
    print(json.dumps(result, indent=2))


def cmd_recent(args: argparse.Namespace) -> None:
    end_us = _now_us()
    start_us = end_us - args.minutes * 60 * 1_000_000
    sql = (
        f"SELECT trace_id, MIN(start_time) AS first_seen, "
        f"COUNT(*) AS span_count, MAX(operation_name) AS sample_op "
        f"FROM \"{DEFAULTS['stream']}\" "
        f"WHERE gen_ai_operation_name IS NOT NULL "
        f"GROUP BY trace_id "
        f"ORDER BY first_seen DESC "
        f"LIMIT {args.limit}"
    )
    result = _search(sql, start_us, end_us)
    hits = result.get("hits", [])
    for h in hits:
        ts = h.get("first_seen", 0) / 1_000_000_000
        when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
        print(f"{h.get('trace_id')}  {when}  {h.get('span_count')} spans  {h.get('sample_op')}")
    if not hits:
        print(f"(no LLM-instrumented traces in the last {args.minutes} minutes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_trace = sub.add_parser("trace", help="Fetch all spans for a trace_id")
    p_trace.add_argument("trace_id")
    p_trace.add_argument("--from", dest="start_time", type=int,
                         help="Start time in microseconds since epoch")
    p_trace.add_argument("--to", dest="end_time", type=int,
                         help="End time in microseconds since epoch")
    p_trace.add_argument("--size", type=int, default=1000)
    p_trace.add_argument("--summary", action="store_true",
                         help="Print indented tree instead of raw JSON")
    p_trace.set_defaults(func=cmd_trace)

    p_search = sub.add_parser("search", help="Run a raw SQL search")
    p_search.add_argument("sql")
    p_search.add_argument("--from", dest="start_time", type=int)
    p_search.add_argument("--to", dest="end_time", type=int)
    p_search.add_argument("--size", type=int, default=1000)
    p_search.add_argument("--type", default="traces",
                          choices=["traces", "logs", "metrics"])
    p_search.add_argument("--summary", action="store_true")
    p_search.set_defaults(func=cmd_search)

    p_recent = sub.add_parser("recent", help="List recent traces with LLM activity")
    p_recent.add_argument("--minutes", type=int, default=60)
    p_recent.add_argument("--limit", type=int, default=20)
    p_recent.set_defaults(func=cmd_recent)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
