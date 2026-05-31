# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp"]
# ///
"""Mock MCP server (stdio transport) with a dozen stub tools. Launched as a subprocess by maf.py via MCPStdioTool."""

import random
from datetime import UTC, datetime

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mock-mcp")


@mcp.tool()
def current_time(timezone: str = "UTC") -> str:
    """Current time for a timezone."""
    return f"{datetime.now(UTC).isoformat()} ({timezone})"


@mcp.tool()
def flip_coin() -> str:
    """Flip a coin."""
    return random.choice(["heads", "tails"])


@mcp.tool()
def roll_dice(sides: int = 6, count: int = 1) -> list[int]:
    """Roll N dice with given sides."""
    return [random.randint(1, sides) for _ in range(count)]


@mcp.tool()
def reverse_string(text: str) -> str:
    """Reverse a string."""
    return text[::-1]


@mcp.tool()
def word_count(text: str) -> int:
    """Count words in a string."""
    return len(text.split())


@mcp.tool()
def uppercase(text: str) -> str:
    """Uppercase a string."""
    return text.upper()


@mcp.tool()
def stock_quote(symbol: str) -> dict:
    """Fake stock quote for a ticker."""
    return {"symbol": symbol.upper(), "price": round(random.uniform(10, 500), 2), "currency": "USD"}


@mcp.tool()
def translate(text: str, target_lang: str) -> str:
    """Fake translation."""
    return f"[{target_lang}] {text}"


@mcp.tool()
def search_docs(query: str, limit: int = 3) -> list[dict]:
    """Fake document search."""
    return [{"title": f"Doc about {query} #{i}", "score": round(random.random(), 3)} for i in range(limit)]


@mcp.tool()
def send_notification(channel: str, message: str) -> str:
    """Pretend to send a notification."""
    return f"sent to {channel}: {message[:40]}"


@mcp.tool()
def get_user_profile(user_id: str) -> dict:
    """Fake user profile lookup."""
    return {"id": user_id, "name": f"User {user_id}", "email": f"{user_id}@example.com", "tier": random.choice(["free", "pro", "enterprise"])}


@mcp.tool()
def crash() -> str:
    """Always raises. Use to generate MCP tool error spans."""
    raise RuntimeError("intentional MCP tool failure")


if __name__ == "__main__":
    mcp.run()
