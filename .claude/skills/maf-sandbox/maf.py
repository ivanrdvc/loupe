# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "agent-framework-core",
#   "agent-framework-openai",
#   "agent-framework-devui",
#   "opentelemetry-sdk",
#   "opentelemetry-exporter-otlp-proto-http",
#   "python-dotenv",
#   "mcp",
# ]
# ///
"""MAF sandbox: main agent + weather subagent + MCP + scheduled tasks. Serves OpenAI-compat endpoints via DevUI; emits OTel to local OpenObserve. Run: uv run maf.py."""

import asyncio
import os
import random
import uuid
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv

# Load OPENAI_API_KEY (and anything else) from the agentops repo .env.local — gitignored.
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

from agent_framework import Agent, MCPStdioTool, tool  # noqa: E402
from agent_framework.devui import serve  # noqa: E402
from agent_framework.observability import configure_otel_providers, get_tracer  # noqa: E402
from agent_framework.openai import OpenAIChatClient  # noqa: E402

configure_otel_providers(enable_sensitive_data=True)

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

main_agent = Agent(
    client=OpenAIChatClient(model=MODEL),
    name="sandbox-agent",
    description="Multi-purpose test agent with function tools, an MCP server, a weather subagent, and task scheduling.",
    instructions=(
        "You are a test agent for generating telemetry. Use tools liberally to demonstrate capabilities. "
        "Hand off weather questions to weather-specialist. Use mock_mcp tools when the user asks for "
        "utilities only it provides. You can schedule prompts to run later."
    ),
    tools=[*FUNCTION_TOOLS, schedule_task, weather_subagent.as_tool(), mcp_tool],
)


if __name__ == "__main__":
    print(f"MAF sandbox on http://localhost:{PORT} — OTel → http://localhost:5080/api/default")
    serve(entities=[main_agent, weather_subagent], port=PORT, auto_open=False, auth_enabled=False)
