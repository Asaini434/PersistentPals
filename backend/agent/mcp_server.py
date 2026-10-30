from __future__ import annotations

from collections.abc import Callable
from typing import Any

import anyio
from fastmcp import Client, FastMCP


def create_dashboard_mcp(lookup: Callable[[str], dict[str, Any]]) -> FastMCP:
    """Create a request-scoped MCP server exposing the authorized dashboard lookup."""
    server = FastMCP("ReflectX dashboard data")

    @server.tool(
        description=(
            "Retrieve dashboard records for the authenticated chat user. "
            "Results are limited to that user's role and patient assignments."
        )
    )
    def lookup_dashboard_data(query: str) -> dict[str, Any]:
        return lookup(query)

    return server


def call_dashboard_tool(server: FastMCP, query: str) -> dict[str, Any]:
    """Call the dashboard tool over FastMCP's in-memory MCP transport."""
    async def call() -> dict[str, Any]:
        async with Client(server) as client:
            result = await client.call_tool("lookup_dashboard_data", {"query": query})
            if result.is_error or result.structured_content is None:
                raise RuntimeError("Dashboard MCP tool returned no structured result.")
            return result.structured_content

    return anyio.run(call)