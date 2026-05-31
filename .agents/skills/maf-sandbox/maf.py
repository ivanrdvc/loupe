# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "agent-framework-core",
#   "agent-framework-openai",
#   "agent-framework-devui",
#   "opentelemetry-sdk==1.40",
#   "opentelemetry-api==1.40",
#   "opentelemetry-exporter-otlp-proto-http==1.40",
#   "azure-monitor-opentelemetry-exporter==1.0.0b52",
#   "python-dotenv",
#   "mcp",
# ]
# ///
"""MAF sandbox: main agent + weather subagent + MCP + scheduled tasks. Serves OpenAI-compat endpoints via DevUI; emits OTel to local OpenObserve and (if APPLICATIONINSIGHTS_CONNECTION_STRING is set) App Insights. Run: uv run maf.py."""

import asyncio
import os
import random
import uuid
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv

# Load OPENAI_API_KEY (and anything else) from the loupe repo .env.local — gitignored.
_REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_REPO_ROOT / ".env.local")
load_dotenv(_REPO_ROOT / ".env")

# MAF passes endpoints to OTLPSpanExporter(endpoint=...) explicitly, which skips
# OTel's automatic `/v1/{signal}` path appending. So set the full per-signal URLs.
_OO_BASE = "http://localhost:5080/api/default"
os.environ.setdefault("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
os.environ.setdefault("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", f"{_OO_BASE}/v1/traces")
os.environ.setdefault("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", f"{_OO_BASE}/v1/metrics")
os.environ.setdefault("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", f"{_OO_BASE}/v1/logs")
os.environ.setdefault(
    "OTEL_EXPORTER_OTLP_HEADERS",
    "Authorization=Basic cm9vdEBleGFtcGxlLmNvbTpDb21wbGV4cGFzcyMxMjM=,organization=default,stream-name=default",
)
os.environ.setdefault("OTEL_SERVICE_NAME", "maf-sandbox")

from contextvars import ContextVar

from agent_framework import (  # noqa: E402
    Agent,
    AgentContext,
    AgentMiddleware,
    ChatContext,
    ChatMiddleware,
    MCPStdioTool,
    tool,
)
from agent_framework.devui import serve  # noqa: E402
from agent_framework.observability import configure_otel_providers, get_tracer  # noqa: E402
from agent_framework.openai import OpenAIChatClient  # noqa: E402

configure_otel_providers(enable_sensitive_data=True)

# Dual-emit to App Insights when configured — exercises the 8 KB
# customDimensions truncation that the loupe truncation-resilience branch
# is meant to handle. Silently skipped when the connection string isn't set,
# so the sandbox still works against OO alone.
_AI_CONN = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
if _AI_CONN:
    from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter  # noqa: E402
    from opentelemetry import trace as _otel_trace  # noqa: E402
    from opentelemetry.sdk.trace import TracerProvider  # noqa: E402
    from opentelemetry.sdk.trace.export import BatchSpanProcessor  # noqa: E402

    _tp = _otel_trace.get_tracer_provider()
    if isinstance(_tp, TracerProvider):
        _tp.add_span_processor(BatchSpanProcessor(AzureMonitorTraceExporter(connection_string=_AI_CONN)))

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
PORT = int(os.environ.get("MAF_PORT", "4280"))


@tool(approval_mode="never_require")
async def get_weather(location: Annotated[str, "City name"]) -> str:
    """Current weather for a location."""
    await asyncio.sleep(0.1)
    return f"{location}: {random.choice(['sunny', 'cloudy', 'rainy'])}, {random.randint(5, 30)}°C"


@tool(approval_mode="never_require")
def get_forecast(location: Annotated[str, "City"], days: Annotated[int, "How many days"]) -> str:
    """Multi-day forecast."""
    return f"{location} forecast ({days}d): " + ", ".join(random.choice(["☀", "☁", "🌧"]) for _ in range(days))


@tool(approval_mode="never_require")
def add(a: Annotated[float, "first"], b: Annotated[float, "second"]) -> float:
    """Add two numbers."""
    return a + b


@tool(approval_mode="never_require")
def multiply(a: Annotated[float, "first"], b: Annotated[float, "second"]) -> float:
    """Multiply two numbers."""
    return a * b


@tool(approval_mode="never_require")
def random_number(low: Annotated[int, "min"] = 0, high: Annotated[int, "max"] = 100) -> int:
    """Random integer in [low, high]."""
    return random.randint(low, high)


@tool(approval_mode="never_require")
def echo(text: Annotated[str, "anything"]) -> str:
    """Echo input back."""
    return text


@tool(approval_mode="never_require")
async def slow_task(seconds: Annotated[int, "delay"]) -> str:
    """Sleep N seconds then return. Generates long-running tool spans."""
    await asyncio.sleep(seconds)
    return f"slept {seconds}s"


@tool(approval_mode="never_require")
def fail_sometimes(probability: Annotated[float, "0-1 chance of failure"] = 0.5) -> str:
    """Raises with given probability. Generates error spans."""
    if random.random() < probability:
        raise RuntimeError(f"simulated failure (p={probability})")
    return "ok"


@tool(approval_mode="never_require")
def list_items(category: Annotated[str, "category"]) -> list[str]:
    """Return a list (array-result span shape)."""
    return [f"{category}-{i}" for i in range(random.randint(2, 6))]


@tool(approval_mode="never_require")
def lookup_user(user_id: Annotated[str, "user id"]) -> dict:
    """Return a dict (object-result span shape)."""
    return {"id": user_id, "name": f"User {user_id}", "active": random.choice([True, False])}


FUNCTION_TOOLS = [get_weather, get_forecast, add, multiply, random_number, echo, slow_task, fail_sometimes, list_items, lookup_user]

weather_subagent = Agent(
    client=OpenAIChatClient(model=MODEL),
    name="weather-specialist",
    description="Specialist for weather analysis.",
    instructions="Answer weather questions using your tools. Be concise.",
    tools=[get_weather, get_forecast],
)

_pending_tasks: dict[str, asyncio.Task] = {}


@tool(approval_mode="never_require")
async def schedule_task(
    prompt: Annotated[str, "Prompt the agent will run later"],
    delay_seconds: Annotated[int, "Seconds to wait before firing"],
) -> str:
    """Queue a prompt to run against this agent after a delay. Returns scheduled task id."""
    task_id = uuid.uuid4().hex[:8]

    async def fire() -> None:
        await asyncio.sleep(delay_seconds)
        with get_tracer().start_as_current_span("scheduled_run") as span:
            span.set_attribute("session.trigger_type", "scheduled")
            span.set_attribute("task.id", task_id)
            span.set_attribute("task.kind", "one_shot")
            await main_agent.run(prompt)

    _pending_tasks[task_id] = asyncio.create_task(fire())
    return f"scheduled {task_id} (fires in {delay_seconds}s)"


mcp_tool = MCPStdioTool(
    name="mock_mcp",
    description="Mock MCP server with assorted utility tools.",
    command="uv",
    args=["run", str(Path(__file__).parent / "mcp_server.py")],
)

  # main_agent is defined further down — it needs `_ALL_DYNTOOLS` and the
  # middleware classes declared in the dynamic-tools block below.


# =============================================================================
# Dynamic mid-turn tool registration demo (load_tools pattern)
# =============================================================================
#
# The LLM starts the run seeing only one tool: `load_tools(domain)`. When it
# calls load_tools, that domain's 5 tools become visible on subsequent LLM
# turns within the same run.
#
# Mechanism: per-run ContextVar holds a *mutable* set of "loaded" domains.
# The set instance is created once per agent run (by AgentMiddleware) and
# mutated in place from inside tool bodies. We can't rebind the ContextVar
# from inside a tool because the agent's tool-execution loop runs each tool
# via asyncio.gather, which wraps coroutines in Tasks — and each Task gets
# an isolated copy of the parent's context. So `cv.set(new_set)` inside the
# tool is invisible to the next middleware turn. Mutating the *shared* set
# instance held by the ContextVar works because both the task and the parent
# hold the same reference.
#
# A ChatMiddleware filters `context.options["tools"]` in-place each turn
# before the LLM call. Because the same dict is reused across iterations
# of FunctionInvocationLayer's loop (`mutable_options["tools"]`), the
# filtered list is what the tool-execution lookup also sees — and
# `load_tools` is always included so it remains executable.

_loaded_domains: ContextVar[set[str]] = ContextVar("loaded_domains")


def _weather_now(location: Annotated[str, "city"]) -> str:
    return f"{location}: {random.choice(['sunny', 'cloudy', 'rainy'])}, {random.randint(5, 30)}°C"


def _weather_forecast(location: Annotated[str, "city"], days: Annotated[int, "days"] = 3) -> str:
    return f"{location} forecast ({days}d): " + ", ".join(random.choice(["☀", "☁", "🌧"]) for _ in range(days))


def _weather_alerts(region: Annotated[str, "region code"]) -> list[str]:
    return random.sample(["high winds", "frost", "heatwave", "flood watch", "none"], k=2)


def _weather_humidity(location: Annotated[str, "city"]) -> int:
    return random.randint(20, 95)


def _weather_uv_index(location: Annotated[str, "city"]) -> int:
    return random.randint(0, 11)


def _files_read(path: Annotated[str, "path"]) -> str:
    return f"<contents of {path}: {random.randint(10, 999)} bytes>"


def _files_write(path: Annotated[str, "path"], content: Annotated[str, "text"]) -> str:
    return f"wrote {len(content)} bytes to {path}"


def _files_list(directory: Annotated[str, "dir"]) -> list[str]:
    return [f"{directory}/file_{i}.txt" for i in range(random.randint(2, 5))]


def _files_delete(path: Annotated[str, "path"]) -> str:
    return f"deleted {path}"


def _files_exists(path: Annotated[str, "path"]) -> bool:
    return random.choice([True, False])


def _math_add(a: Annotated[float, "a"], b: Annotated[float, "b"]) -> float:
    return a + b


def _math_sub(a: Annotated[float, "a"], b: Annotated[float, "b"]) -> float:
    return a - b


def _math_mul(a: Annotated[float, "a"], b: Annotated[float, "b"]) -> float:
    return a * b


def _math_sqrt(x: Annotated[float, "x"]) -> float:
    return x**0.5


def _math_factorial(n: Annotated[int, "n"]) -> int:
    result = 1
    for i in range(2, max(2, n + 1)):
        result *= i
    return result


def _wrap_domain_tool(domain: str, name: str, fn: Any) -> Any:
    """Wrap a plain callable as a @tool with a domain_name name (OpenAI rejects dots)."""
    return tool(name=f"{domain}_{name}", description=f"[{domain}] {name}", approval_mode="never_require")(fn)


_DOMAIN_TOOLS: dict[str, list[Any]] = {
    "weather": [
        _wrap_domain_tool("weather", "now", _weather_now),
        _wrap_domain_tool("weather", "forecast", _weather_forecast),
        _wrap_domain_tool("weather", "alerts", _weather_alerts),
        _wrap_domain_tool("weather", "humidity", _weather_humidity),
        _wrap_domain_tool("weather", "uv_index", _weather_uv_index),
    ],
    "files": [
        _wrap_domain_tool("files", "read", _files_read),
        _wrap_domain_tool("files", "write", _files_write),
        _wrap_domain_tool("files", "list", _files_list),
        _wrap_domain_tool("files", "delete", _files_delete),
        _wrap_domain_tool("files", "exists", _files_exists),
    ],
    "math": [
        _wrap_domain_tool("math", "add", _math_add),
        _wrap_domain_tool("math", "sub", _math_sub),
        _wrap_domain_tool("math", "mul", _math_mul),
        _wrap_domain_tool("math", "sqrt", _math_sqrt),
        _wrap_domain_tool("math", "factorial", _math_factorial),
    ],
}


@tool(approval_mode="never_require")
def load_tools(domain: Annotated[str, "one of: weather, files, math"]) -> str:
    """Register the given domain's tools so they become available on subsequent turns of this run."""
    domain = domain.strip().lower()
    if domain not in _DOMAIN_TOOLS:
        return f"unknown domain '{domain}'. available: {sorted(_DOMAIN_TOOLS)}"
    try:
        current = _loaded_domains.get()
    except LookupError:
        return "internal error: loaded-domains state not initialised for this run"
    if domain in current:
        return f"'{domain}' already loaded. Currently loaded domains: {sorted(current)}"
    current.add(domain)  # in-place mutation — survives across asyncio.gather tasks
    names = [t.name for t in _DOMAIN_TOOLS[domain]]
    return f"loaded {len(names)} tools from '{domain}': {names}. Currently loaded domains: {sorted(current)}"


_ALL_DYNTOOLS: list[Any] = [load_tools, *[t for tools in _DOMAIN_TOOLS.values() for t in tools]]
_DOMAIN_TOOL_NAMES: dict[str, set[str]] = {
    domain: {t.name for t in tools} for domain, tools in _DOMAIN_TOOLS.items()
}


class _ResetLoadedDomainsMiddleware(AgentMiddleware):
    """Install a fresh, *shared* loaded-domains set at the start of every agent run.

    The set is mutated in place by `load_tools`; the ChatMiddleware reads it on every
    turn. Per-run isolation is guaranteed because `cv.set` is scoped to the agent run's
    contextvar state, and the agent run itself runs in a fresh request context.
    """

    async def process(self, context: AgentContext, call_next: Any) -> None:
        _loaded_domains.set(set())
        await call_next()


_DOMAIN_TOOL_FULL_NAMES: set[str] = {
    name for names in _DOMAIN_TOOL_NAMES.values() for name in names
}


class _DynamicToolGateMiddleware(ChatMiddleware):
    """Filter options['tools'] before each LLM turn: drop domain tools whose domain isn't loaded.

    Static tools (load_tools, static FUNCTION_TOOLS, MCP, subagent handoff, schedule) always pass
    through. Domain tools (weather_*, files_*, math_*) only appear after their domain is loaded
    via load_tools(domain). Mutates the shared `mutable_options` dict in place so the agent's
    tool-execution loop sees the same filtered list.
    """

    async def process(self, context: ChatContext, call_next: Any) -> None:
        opts = context.options
        if isinstance(opts, dict) and opts.get("tools") is not None:
            try:
                loaded = _loaded_domains.get()
            except LookupError:
                loaded = set()
            allowed_domain_tools = {
                name for domain in loaded for name in _DOMAIN_TOOL_NAMES[domain]
            }
            opts["tools"] = [
                t for t in opts["tools"]
                if t.name not in _DOMAIN_TOOL_FULL_NAMES or t.name in allowed_domain_tools
            ]
        await call_next()


main_agent = Agent(
    client=OpenAIChatClient(model=MODEL),
    name="sandbox-agent",
    description="Multi-purpose test agent with function tools, an MCP server, a weather subagent, task scheduling, and dynamic mid-turn tool loading.",
    instructions=(
        "You are a test agent for generating telemetry. Use tools liberally to demonstrate capabilities. "
        "Hand off weather questions to weather-specialist. Use mock_mcp tools when the user asks for "
        "utilities only it provides. You can schedule prompts to run later. "
        "Some tool families are gated behind load_tools(domain) — domains are 'weather', 'files', 'math'. "
        "Those domain tools (weather_now, files_read, math_factorial, ...) only become visible after you "
        "call load_tools('X') ONCE for the domain you need; on the next turn they're available. Don't "
        "call load_tools again for a domain that's already loaded."
    ),
    tools=[
        *FUNCTION_TOOLS,
        schedule_task,
        weather_subagent.as_tool(),
        mcp_tool,
        load_tools,
        *[t for tools in _DOMAIN_TOOLS.values() for t in tools],
    ],
    middleware=[_ResetLoadedDomainsMiddleware(), _DynamicToolGateMiddleware()],
)


if __name__ == "__main__":
    print(f"MAF sandbox on http://localhost:{PORT}")
    print(f"  OTel → http://localhost:5080/api/default  (OpenObserve)")
    if _AI_CONN:
        # Strip the connection string itself — print only the ingestion host so
        # the user can confirm which AppInsights they're hitting without
        # leaking the InstrumentationKey.
        _ingest = next(
            (p.split("=", 1)[1] for p in _AI_CONN.split(";") if p.startswith("IngestionEndpoint=")),
            "(unknown endpoint)",
        )
        print(f"  OTel → {_ingest}  (AppInsights)")
    else:
        print("  ⚠  AppInsights export OFF — set APPLICATIONINSIGHTS_CONNECTION_STRING in")
        print(f"     {_REPO_ROOT / '.env.local'} to enable. Without it, loupe")
        print("     (which reads AppInsights by default) will NOT see these traces.")
    serve(
        entities=[main_agent, weather_subagent],
        port=PORT,
        auto_open=False,
        auth_enabled=False,
    )
