#!/usr/bin/env python3
"""Fire a prompt at the MAF sandbox. Auto-starts the sandbox if it isn't running, then POSTs a correctly-shaped Responses API request and prints the JSON reply (or the raw SSE stream with --stream).

Usage:
    ./fire.py "your prompt here"
    ./fire.py "another prompt" --stream

DevUI requires input items shaped as `{"type":"message","content":[{"type":"input_text","text":"..."}]}` — items without `type:"message"` are silently dropped. This script handles that so callers don't have to remember.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PORT = os.environ.get("MAF_PORT", "4280")
HERE = Path(__file__).resolve().parent
LOG_PATH = os.environ.get("MAF_LOG", "/tmp/maf-sandbox.log")
CONVERSATION_MAP = Path(os.environ.get("MAF_CONVERSATIONS", "/tmp/maf-sandbox-conversations.json"))
BASE = f"http://localhost:{PORT}"


def find_entity_id(name: str = "sandbox-agent") -> str | None:
    """Return entity id once the sandbox is up AND the named agent is registered.

    Returns None if the sandbox isn't reachable or the entity isn't there yet —
    the single check covers both "is it up?" and "is the registry populated?",
    closing the race where /health goes green before /v1/entities is ready.
    """
    try:
        with urllib.request.urlopen(f"{BASE}/v1/entities", timeout=1) as r:
            for e in json.load(r)["entities"]:
                if e["name"] == name:
                    return e["id"]
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        pass
    return None


def wait_until_ready(name: str = "sandbox-agent", timeout: int = 60) -> str:
    for _ in range(timeout):
        eid = find_entity_id(name)
        if eid:
            return eid
        time.sleep(1)
    sys.exit(f"sandbox not ready within {timeout}s; tail {LOG_PATH}")


def resolve_conversation(label: str, eid: str) -> str:
    try:
        conversations = json.loads(CONVERSATION_MAP.read_text())
    except (OSError, json.JSONDecodeError):
        conversations = {}
    conversation = conversations.get(label)
    if conversation:
        try:
            urllib.request.urlopen(f"{BASE}/v1/conversations/{conversation}", timeout=2).close()
            return conversation
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    body = json.dumps({
        "metadata": {"agent_id": eid, "entity_id": eid, "label": label},
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/conversations",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=2) as response:
        conversation = json.load(response)["id"]
    conversations[label] = conversation
    CONVERSATION_MAP.write_text(json.dumps(conversations))
    return conversation


def start() -> None:
    print(f"starting sandbox on :{PORT} (logs: {LOG_PATH})", file=sys.stderr)
    with open(LOG_PATH, "ab") as log:
        subprocess.Popen(
            ["uv", "run", str(HERE / "maf.py")],
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )


def fire(prompt: str, eid: str, *, stream: bool, agent: str, conversation: str | None) -> None:
    body = json.dumps({
        "model": agent,
        "input": [{
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": prompt}],
        }],
        "metadata": {"entity_id": eid},
        **({"conversation": conversation} if conversation else {}),
        "stream": stream,
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/responses",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        if stream:
            for chunk in iter(lambda: r.read1(4096), b""):
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
        else:
            sys.stdout.buffer.write(r.read())


def _arg_value(args: list[str], flag: str, default: str) -> str:
    if flag in args:
        i = args.index(flag)
        if i + 1 < len(args):
            return args[i + 1]
    return default


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in {"-h", "--help"}:
        sys.exit(__doc__)
    prompt = args[0]
    rest = args[1:]
    stream = "--stream" in rest
    agent = _arg_value(rest, "--agent", "sandbox-agent")
    conversation = _arg_value(rest, "--conversation", "") or None
    eid = find_entity_id(agent)
    if eid is None:
        start()
        eid = wait_until_ready(agent)
    if conversation:
        conversation = resolve_conversation(conversation, eid)
    fire(prompt, eid, stream=stream, agent=agent, conversation=conversation)


if __name__ == "__main__":
    main()
