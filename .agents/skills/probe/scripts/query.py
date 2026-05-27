#!/usr/bin/env python3
"""
loupe debug query — pulls trace/session diagnostics from whichever
telemetry provider the loupe .env points at, and prints lean JSON.

Usage:
    query.py <session-or-trace-id>          # per-session diagnostic
    query.py --audit                         # org-wide key-drift audit
    query.py <id> --full                     # include heavy payloads (msgs, tools)

Designed to keep Claude's context light: by default emits attribute KEY NAMES
(not values), truncated tool args/results, and aggregated token counts. Full
payloads are opt-in.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

LOUPE_DIR = Path(__file__).resolve().parents[3].parent  # skill is in loupe/.agents/skills/probe/scripts
ENV_FILE = LOUPE_DIR / ".env"

# What we consider session/user attrs across all OTel/AG-UI/MAF variants.
SESSION_KEYS = [
    "ag_ui.thread_id", "ag_ui_thread_id",
    "session.id", "session_id",
    "gen_ai.conversation.id", "gen_ai_conversation_id",
    "langfuse.session.id", "langfuse_session_id",
    "openinference.session.id", "openinference_session_id",
]
USER_KEYS = [
    "user.id", "user_id",
    "enduser.id", "enduser_id",
    "ag_ui.user.id", "ag_ui_user_id",
]
PURPOSE_KEYS = ["gen_ai.operation.purpose", "gen_ai_operation_purpose"]

# Recognized but not flagged as visibility-blocking — used to suppress false
# positives in the concept-mismatch listing (e.g. thread *title* keys).
NON_BLOCKING_KEYS = {
    "ag_ui.thread.title", "ag_ui_thread_title",
    "session.title", "session_title",
    "thread.title", "thread_title",
    "gen_ai.conversation.title", "gen_ai_conversation_title",
    "user.name", "user_name", "enduser.name", "enduser_name",
}

# Mirrors src/lib/telemetry/field-config.ts ident regex — keys with chars
# outside this set are silently dropped from CUSTOM_*_FIELD env vars.
ENV_IDENT_REGEX = re.compile(r"^[A-Za-z0-9_.]+$")


def load_env() -> dict[str, str]:
    """Read loupe .env. Returns a dict; missing file = empty dict."""
    env: dict[str, str] = {}
    if not ENV_FILE.exists():
        return env
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def detect_provider(env: dict[str, str]) -> str:
    return (env.get("TELEMETRY_PROVIDER") or "openobserve").lower()


def recognized_keys(env: dict[str, str]) -> dict[str, set[str]]:
    """Keys loupe will actually look at, given conventions.ts + .env overrides."""
    sess = set(SESSION_KEYS)
    usr = set(USER_KEYS)
    purp = set(PURPOSE_KEYS)
    for f in (env.get("CUSTOM_SESSION_ID_FIELDS") or "").split(","):
        if f.strip() and ENV_IDENT_REGEX.match(f.strip()): sess.add(f.strip())
    for f in (env.get("CUSTOM_USER_ID_FIELDS") or "").split(","):
        if f.strip() and ENV_IDENT_REGEX.match(f.strip()): usr.add(f.strip())
    p = (env.get("CUSTOM_LLM_PURPOSE_FIELD") or "").strip()
    if p and ENV_IDENT_REGEX.match(p): purp.add(p)
    return {"session": sess, "user": usr, "purpose": purp}


def env_health(env: dict[str, str]) -> list[dict[str, str]]:
    """Flag CUSTOM_* env values that field-config.ts would silently reject."""
    out: list[dict[str, str]] = []
    for var in ("CUSTOM_SESSION_ID_FIELDS", "CUSTOM_USER_ID_FIELDS",
                "CUSTOM_LLM_PURPOSE_FIELD", "CUSTOM_SESSION_KIND_FIELD"):
        raw = (env.get(var) or "").strip()
        if not raw: continue
        bad = [p.strip() for p in raw.split(",")
               if p.strip() and not ENV_IDENT_REGEX.match(p.strip())]
        if bad:
            out.append({"var": var, "value": raw, "rejected": bad,
                        "note": "field-config.ts ident() silently drops these — chars outside [A-Za-z0-9_.]"})
    return out


# ---------- App Insights ----------

def query_app_insights(env: dict[str, str], kql: str, timespan: str = "P30D") -> list[dict[str, Any]]:
    app_id = env.get("APPLICATIONINSIGHTS_APP_ID")
    api_key = env.get("APPLICATIONINSIGHTS_API_KEY")
    if not app_id or not api_key:
        raise SystemExit("App Insights selected but APPLICATIONINSIGHTS_APP_ID/API_KEY not set in .env")
    url = f"https://api.applicationinsights.io/v1/apps/{urllib.parse.quote(app_id)}/query"
    body = json.dumps({"query": kql, "timespan": timespan}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"x-api-key": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    if "error" in data:
        raise SystemExit(f"AppInsights error: {data['error']}")
    rows: list[dict[str, Any]] = []
    table = next((t for t in data.get("tables", []) if t.get("name") == "PrimaryResult"), None)
    if not table:
        return rows
    cols = [c["name"] for c in table["columns"]]
    for r in table["rows"]:
        rows.append(dict(zip(cols, r)))
    return rows


# ---------- OpenObserve ----------

def query_openobserve(env: dict[str, str], sql: str, hours: int = 168) -> list[dict[str, Any]]:
    base = env.get("OO_BASE_URL", "http://localhost:5080").rstrip("/")
    org = env.get("OO_ORG", "default")
    stream = env.get("OO_STREAM", "default")
    user = env.get("OO_USER", "root@example.com")
    pw = env.get("OO_PASS", "Complexpass#123")
    # window
    import time
    now_us = int(time.time() * 1_000_000)
    start_us = now_us - hours * 3600 * 1_000_000
    sql_resolved = sql.replace("{stream}", f'"{stream}"')
    payload = json.dumps({
        "query": {"sql": sql_resolved, "start_time": start_us, "end_time": now_us, "from": 0, "size": 1000}
    }).encode()
    token = base64.b64encode(f"{user}:{pw}".encode()).decode()
    req = urllib.request.Request(
        f"{base}/api/{org}/_search?type=traces",
        data=payload,
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data.get("hits", [])


# ---------- Per-session diagnostic ----------

def diagnose_session_app_insights(env: dict[str, str], session_id: str, full: bool) -> dict[str, Any]:
    # Resolve session → trace_ids: match operation_Id OR any customDimensions value.
    safe = re.sub(r"[^A-Za-z0-9_-]", "", session_id)
    if not safe or safe != session_id:
        raise SystemExit(f"Refusing unsafe id: {session_id!r}")
    resolve_kql = f"""
        union dependencies, requests
        | where operation_Id == "{safe}" or customDimensions has "{safe}"
        | distinct operation_Id
    """
    rows = query_app_insights(env, resolve_kql)
    trace_ids = [r["operation_Id"] for r in rows if r.get("operation_Id")]
    if not trace_ids:
        return {"session_id": session_id, "provider": "app-insights", "trace_ids": [], "note": "No traces found for this id in last 3 days."}

    id_list = ",".join(f'"{t}"' for t in trace_ids)
    spans_kql = f"""
        union dependencies, requests
        | where operation_Id in ({id_list})
        | project itemType, id, operation_Id, operation_ParentId, name, timestamp, duration, success, customDimensions
        | order by timestamp asc
    """
    span_rows = query_app_insights(env, spans_kql)

    traces: dict[str, dict[str, Any]] = {}
    spans_by_id: dict[str, dict[str, Any]] = {}  # for parent walks
    for r in span_rows:
        tid = r["operation_Id"]
        t = traces.setdefault(tid, {"trace_id": tid, "span_count": 0, "timeline": [], "tool_calls": [], "errors": [], "tokens": {"input": 0, "output": 0}, "user_id": None, "session_attr_keys": set(), "purpose_keys": set(), "_chat_purpose_drift": []})
        cd = parse_cd(r.get("customDimensions"))
        spans_by_id[r.get("id")] = {"name": r.get("name"), "parent": r.get("operation_ParentId"), "cd": cd}
        sess_keys = [k for k in SESSION_KEYS if cd.get(k)]
        user_keys = [k for k in USER_KEYS if cd.get(k)]
        # purpose lives under multiple keys depending on producer rev — check both standard and legacy
        purpose_keys = [k for k in PURPOSE_KEYS if cd.get(k)]
        if cd.get("teammate.llm.purpose"): purpose_keys.append("teammate.llm.purpose")
        for k in sess_keys: t["session_attr_keys"].add(k)
        for k in purpose_keys: t["purpose_keys"].add(k)
        # tokens (only chat spans)
        if cd.get("gen_ai.operation.name") == "chat":
            t["tokens"]["input"] += int(cd.get("gen_ai.usage.input_tokens") or 0)
            t["tokens"]["output"] += int(cd.get("gen_ai.usage.output_tokens") or 0)
        # user_id
        if not t["user_id"]:
            for k in USER_KEYS:
                if cd.get(k):
                    t["user_id"] = cd[k]
                    break
        # error
        if r.get("success") is False:
            t["errors"].append({"span": r.get("name"), "id": r.get("id")})
        # tool call
        op_name = str(r.get("name") or "")
        if op_name.startswith("execute_tool "):
            tool = op_name[len("execute_tool "):]
            args = cd.get("gen_ai.tool.call.arguments") or cd.get("gen_ai.input.messages")
            result = cd.get("gen_ai.tool.call.result")
            entry = {"tool": tool, "duration_ms": int(r.get("duration") or 0)}
            if not full:
                if args: entry["args_preview"] = trunc(args, 200)
                if result: entry["result_preview"] = trunc(result, 200)
            else:
                if args: entry["args"] = args
                if result: entry["result"] = result
            t["tool_calls"].append(entry)
        # timeline — only AI-relevant spans by default (drop Cosmos / Azure queue / generic HTTP noise)
        is_ai_relevant = (
            cd.get("gen_ai.operation.name")
            or op_name.startswith("invoke_agent ")
            or op_name.startswith("execute_tool ")
            or cd.get("session.trigger_type")
            or (r.get("success") is False)
            or cd.get("gen_ai.operation.purpose")
            or cd.get("teammate.llm.purpose")
        )
        if is_ai_relevant or full:
            entry_tl: dict[str, Any] = {
                "name": op_name,
                "duration_ms": int(r.get("duration") or 0),
                "gen_ai_op": cd.get("gen_ai.operation.name") or None,
                "purpose": cd.get("gen_ai.operation.purpose") or cd.get("teammate.llm.purpose") or None,
                "error": (r.get("success") is False) or None,
            }
            if cd.get("gen_ai.operation.name") == "chat":
                entry_tl["model"] = cd.get("gen_ai.request.model")
                entry_tl["in_tok"] = int(cd.get("gen_ai.usage.input_tokens") or 0)
                entry_tl["out_tok"] = int(cd.get("gen_ai.usage.output_tokens") or 0)
                cached = int(cd.get("gen_ai.usage.cache_read.input_tokens") or 0)
                if cached: entry_tl["cached_tok"] = cached
                finish = cd.get("gen_ai.response.finish_reasons")
                if finish: entry_tl["finish"] = finish
            t["timeline"].append(entry_tl)
        t["span_count"] += 1

    # Detect "purpose tag on ancestor, not on the chat LLM span" — loupe
    # propagateInheritedAttrs lifts it, but only if the key is recognized.
    def find_ancestor_purpose(span_id: str) -> str | None:
        cur = spans_by_id.get(span_id)
        seen = set()
        while cur and cur["parent"] and cur["parent"] not in seen:
            seen.add(cur["parent"])
            parent = spans_by_id.get(cur["parent"])
            if not parent: return None
            for k in PURPOSE_KEYS + ["teammate.llm.purpose"]:
                if parent["cd"].get(k):
                    return f"{k}={parent['cd'][k]} (on '{parent['name']}')"
            cur = parent
        return None

    recog = recognized_keys(env)
    for tid, t in traces.items():
        for sid, sp in spans_by_id.items():
            if str(sp["name"] or "").startswith("chat ") and not any(sp["cd"].get(k) for k in PURPOSE_KEYS + ["teammate.llm.purpose"]):
                anc = find_ancestor_purpose(sid)
                if anc:
                    t["_chat_purpose_drift"].append({"chat_span": sid, "ancestor_purpose": anc})

    # finalize key_drift: when same concept appears under multiple key forms.
    for t in traces.values():
        sk = sorted(t.pop("session_attr_keys"))
        pk = sorted(t.pop("purpose_keys"))
        drift = {}
        if len(sk) > 1: drift["sessionId"] = sk
        if len(pk) > 1: drift["purpose"] = pk
        # Keys the producer emitted but loupe won't recognize given current config.
        unrec_sess = [k for k in sk if k not in recog["session"]]
        unrec_purp = [k for k in pk if k not in recog["purpose"]]
        if unrec_sess: drift["unrecognized_session_keys"] = unrec_sess
        if unrec_purp: drift["unrecognized_purpose_keys"] = unrec_purp
        # Also flag loupe-style mismatch: only underscore form present, no dotted
        all_dotted = [k for k in sk if "." in k]
        all_under = [k for k in sk if "_" in k and "." not in k]
        if all_under and not all_dotted:
            drift["session_only_underscore"] = all_under
        chat_drift = t.pop("_chat_purpose_drift")
        if chat_drift:
            drift["purpose_on_ancestor_not_on_chat"] = chat_drift
        t["session_keys_present"] = sk
        if drift:
            t["key_drift"] = drift

    out: dict[str, Any] = {
        "session_id": session_id,
        "provider": "app-insights",
        "trace_ids": trace_ids,
        "traces": list(traces.values()),
    }
    health = env_health(env)
    if health: out["env_health"] = health
    return out


def diagnose_session_openobserve(env: dict[str, str], session_id: str, full: bool) -> dict[str, Any]:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", session_id)
    if safe != session_id:
        raise SystemExit(f"Refusing unsafe id: {session_id!r}")
    # Use ag_ui_thread_id (the underscore form is what OO ingests dotted attrs as)
    sql = (
        f"SELECT trace_id, span_id, references_parent_span_id, operation_name, "
        f"start_time, end_time, span_status, gen_ai_operation_name, gen_ai_request_model, "
        f"gen_ai_usage_input_tokens, gen_ai_usage_output_tokens, "
        f"ag_ui_thread_id, session_id, gen_ai_conversation_id, user_id, "
        f"gen_ai_operation_purpose "
        f"FROM {{stream}} WHERE ag_ui_thread_id = '{safe}' OR session_id = '{safe}' "
        f"OR gen_ai_conversation_id = '{safe}' OR trace_id = '{safe}' "
        f"ORDER BY start_time ASC LIMIT 1000"
    )
    hits = query_openobserve(env, sql)
    if not hits:
        return {"session_id": session_id, "provider": "openobserve", "trace_ids": [], "note": "No spans found for this id in last 7 days."}

    traces: dict[str, dict[str, Any]] = {}
    for r in hits:
        tid = r.get("trace_id") or ""
        t = traces.setdefault(tid, {"trace_id": tid, "span_count": 0, "timeline": [], "tool_calls": [], "errors": [], "tokens": {"input": 0, "output": 0}, "user_id": None, "session_keys_present": set(), "purpose_keys": set()})
        sess_keys = [k for k in ("ag_ui_thread_id", "session_id", "gen_ai_conversation_id") if r.get(k)]
        for k in sess_keys: t["session_keys_present"].add(k)
        if r.get("gen_ai_operation_purpose"): t["purpose_keys"].add("gen_ai_operation_purpose")
        if r.get("gen_ai_operation_name") == "chat":
            t["tokens"]["input"] += int(r.get("gen_ai_usage_input_tokens") or 0)
            t["tokens"]["output"] += int(r.get("gen_ai_usage_output_tokens") or 0)
        if not t["user_id"] and r.get("user_id"):
            t["user_id"] = r["user_id"]
        if r.get("span_status") in ("ERROR", "error"):
            t["errors"].append({"span": r.get("operation_name"), "id": r.get("span_id")})
        op_name = str(r.get("operation_name") or "")
        if op_name.startswith("execute_tool "):
            t["tool_calls"].append({"tool": op_name[len("execute_tool "):]})  # OO needs a follow-up query for args/results — skipped for leanness
        is_ai_relevant = (
            r.get("gen_ai_operation_name")
            or op_name.startswith("invoke_agent ")
            or op_name.startswith("execute_tool ")
            or r.get("span_status") in ("ERROR", "error")
            or r.get("gen_ai_operation_purpose")
        )
        if is_ai_relevant or full:
            t["timeline"].append({
                "name": op_name,
                "duration_ms": int(((r.get("end_time") or 0) - (r.get("start_time") or 0)) / 1_000_000),
                "gen_ai_op": r.get("gen_ai_operation_name") or None,
                "session_keys": sess_keys or None,
                "purpose": r.get("gen_ai_operation_purpose") or None,
            })
        t["span_count"] += 1

    for t in traces.values():
        sk = sorted(t.pop("session_keys_present"))
        t["session_keys_present"] = sk
        t.pop("purpose_keys", None)
    return {
        "session_id": session_id,
        "provider": "openobserve",
        "trace_ids": list(traces.keys()),
        "traces": list(traces.values()),
    }


# ---------- Audit (org-wide key drift) ----------

def audit_app_insights(env: dict[str, str]) -> dict[str, Any]:
    kql = """
        union dependencies, requests
        | where timestamp > ago(3d)
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | extend has_dotted = isnotempty(tostring(customDimensions["ag_ui.thread_id"]))
            or isnotempty(tostring(customDimensions["gen_ai.conversation.id"]))
            or isnotempty(tostring(customDimensions["session.id"]))
        | extend has_underscore = isnotempty(tostring(customDimensions["ag_ui_thread_id"]))
            or isnotempty(tostring(customDimensions["gen_ai_conversation_id"]))
            or isnotempty(tostring(customDimensions["session_id"]))
        | extend in_filter = isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool "
            or isnotempty(tostring(customDimensions["session.trigger_type"]))
        | summarize
            total_traces = dcount(operation_Id),
            traces_with_dotted = dcountif(operation_Id, has_dotted),
            traces_with_only_underscore = dcountif(operation_Id, has_underscore and not(has_dotted)),
            traces_in_listSessions_filter = dcountif(operation_Id, in_filter),
            traces_resolvable_either_form = dcountif(operation_Id, has_dotted or has_underscore)
    """
    rows = query_app_insights(env, kql)
    # Distinct keys appearing in customDimensions on AI-relevant spans, grouped
    # by whether loupe will look at them under current config.
    keys_kql = """
        union dependencies, requests
        | where timestamp > ago(3d)
        | where isnotempty(tostring(customDimensions["gen_ai.operation.name"]))
            or name startswith "invoke_agent "
            or name startswith "execute_tool "
            or isnotempty(tostring(customDimensions["session.trigger_type"]))
        | mv-expand kv = bag_keys(customDimensions)
        | extend k = tostring(kv)
        | where k startswith "gen_ai" or k startswith "ag_ui" or k startswith "user"
            or k startswith "enduser" or k startswith "session" or k startswith "langfuse"
            or k startswith "openinference" or k contains "purpose" or k contains "thread"
            or k contains "conversation"
        | summarize n = count() by k
        | order by n desc
        | take 100
    """
    key_rows = query_app_insights(env, keys_kql)
    recog = recognized_keys(env)
    all_recog = recog["session"] | recog["user"] | recog["purpose"]
    seen = [(r["k"], int(r.get("n") or 0)) for r in key_rows if r.get("k")]
    # Categorize: only flag a key as "unrecognized" if it LOOKS like a session/
    # user/purpose concept (the things loupe needs to match on) but isn't in
    # the recognized set. Generic OTel keys like gen_ai.request.model aren't
    # visibility-blocking and shouldn't show up as problems.
    def concept(k: str) -> str | None:
        kl = k.lower()
        if "thread" in kl or "conversation" in kl or "session.id" in kl or "session_id" in kl: return "session"
        if kl.endswith("user.id") or kl.endswith("user_id") or "enduser" in kl: return "user"
        if "purpose" in kl: return "purpose"
        return None
    blocking = [{"key": k, "n": n, "concept": concept(k)} for k, n in seen
                if concept(k) and k not in all_recog and k not in NON_BLOCKING_KEYS]
    return {
        "provider": "app-insights",
        "window": "last 3 days",
        "audit": rows[0] if rows else {},
        "env_health": env_health(env),
        "emitted_keys_unrecognized_for_concept": blocking,
        "recognized_now": {"session": sorted(recog["session"]),
                            "user": sorted(recog["user"]),
                            "purpose": sorted(recog["purpose"])},
    }


def audit_openobserve(env: dict[str, str]) -> dict[str, Any]:
    # OO flattens all dotted attrs to underscore at ingest, so the dotted-vs-underscore
    # issue only exists on App Insights. Surface presence of session keys instead.
    sql = (
        "SELECT COUNT(DISTINCT trace_id) AS total_traces, "
        "COUNT(DISTINCT CASE WHEN ag_ui_thread_id IS NOT NULL OR session_id IS NOT NULL "
        "OR gen_ai_conversation_id IS NOT NULL THEN trace_id END) AS traces_with_session_attr, "
        "COUNT(DISTINCT CASE WHEN gen_ai_operation_name = 'chat' OR operation_name LIKE 'invoke_agent %' "
        "OR operation_name LIKE 'execute_tool %' THEN trace_id END) AS traces_in_filter "
        "FROM {stream}"
    )
    hits = query_openobserve(env, sql, hours=72)
    return {"provider": "openobserve", "window": "last 72 hours", "audit": hits[0] if hits else {}}


# ---------- Helpers ----------

def parse_cd(raw: Any) -> dict[str, Any]:
    if raw is None: return {}
    if isinstance(raw, dict): return raw
    if isinstance(raw, str):
        try: return json.loads(raw)
        except json.JSONDecodeError: return {}
    return {}


def trunc(s: Any, n: int) -> str:
    s = str(s)
    return s if len(s) <= n else s[:n] + f"… ({len(s)} chars total)"


def extract_id(arg: str) -> str:
    """Pull a UUID out of a URL or message, else return arg as-is."""
    m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", arg)
    if m: return m.group(0)
    # also accept hex trace ids (no dashes, 16-64 chars)
    m = re.search(r"\b[0-9a-f]{16,64}\b", arg)
    if m: return m.group(0)
    return arg.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("id_or_url", nargs="?", help="session/trace id, or URL containing one")
    ap.add_argument("--audit", action="store_true", help="org-wide key-drift audit")
    ap.add_argument("--full", action="store_true", help="include heavy payloads (args, results)")
    args = ap.parse_args()

    env = load_env()
    provider = detect_provider(env)

    if args.audit:
        if provider == "app-insights":
            out = audit_app_insights(env)
        else:
            out = audit_openobserve(env)
    else:
        if not args.id_or_url:
            ap.error("provide an id/url, or use --audit")
        sid = extract_id(args.id_or_url)
        if provider == "app-insights":
            out = diagnose_session_app_insights(env, sid, args.full)
        else:
            out = diagnose_session_openobserve(env, sid, args.full)

    json.dump(out, sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
