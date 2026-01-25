# mcp-tool-filter - Semantic Tool Filter

The core token optimization layer that reduces tool exposure from ~40,000 tokens to ~800 tokens using semantic search.

## Purpose

Instead of exposing 350+ tools directly to Claude (consuming massive tokens), this filter exposes only 3 meta-tools:

1. **search_tools** - Semantically search for relevant tools
2. **execute_tool** - Execute any tool by name
3. **list_all_tools** - Browse all available tools

## How It Works

1. On startup, fetches all tools from upstream MCP server
2. Builds semantic embeddings using local MiniLM model
3. When Claude needs a tool, it searches semantically
4. Filter returns top-K most relevant tools
5. Claude executes via `execute_tool`

## Token Savings

| Scenario | Tokens | Notes |
|----------|--------|-------|
| Direct connection to 350 tools | ~40,000 | Every tool schema sent |
| With tool filter | ~800 | Only 3 meta-tool schemas |
| **Savings** | **98%** | More room for conversation |

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with status |
| `/mcp` | POST | MCP JSON-RPC (Streamable HTTP) |
| `/sse` | GET | MCP SSE endpoint |
| `/message` | POST | SSE message handler |

## Meta Tools

### search_tools
```json
{
  "name": "search_tools",
  "description": "Search for relevant MCP tools based on your query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language description of what you want to do"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of tools to return (default: 15)"
      }
    },
    "required": ["query"]
  }
}
```

### execute_tool
```json
{
  "name": "execute_tool",
  "description": "Execute an MCP tool by name",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tool_name": {
        "type": "string",
        "description": "The exact name of the tool to execute"
      },
      "arguments": {
        "type": "object",
        "description": "Arguments to pass to the tool"
      }
    },
    "required": ["tool_name"]
  }
}
```

### list_all_tools
```json
{
  "name": "list_all_tools",
  "description": "List all available MCP tools without filtering",
  "inputSchema": {
    "type": "object",
    "properties": {
      "page": { "type": "number", "default": 1 },
      "per_page": { "type": "number", "default": 20 }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| MCPJUNGLE_URL | http://mcpjungle:8080 | Upstream MCP server |
| MCPJUNGLE_TOKEN | (none) | Auth token if required |
| PORT | 8080 | Listen port |
| TOP_K | 15 | Default search results |

## Semantic Search

Uses local embeddings via `@portkey-ai/mcp-tool-filter`:
- Model: `Xenova/all-MiniLM-L6-v2` (~25MB)
- No API keys required
- First run downloads model automatically
- Quantized for fast inference

## Example Usage

### Search for tools
```bash
curl -X POST http://localhost:8098/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_tools",
      "arguments": {
        "query": "read files from disk"
      }
    }
  }'
```

### Execute a tool
```bash
curl -X POST http://localhost:8098/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "execute_tool",
      "arguments": {
        "tool_name": "filesystem__read_file",
        "arguments": { "path": "/etc/hostname" }
      }
    }
  }'
```

## Health Check Response

```json
{
  "status": "healthy",
  "toolsLoaded": 354,
  "serversConnected": 22,
  "semanticFilterReady": true,
  "sessionActive": true,
  "sseConnections": 1
}
```

## Credits

Built using [Portkey MCP Tool Filter](https://github.com/Portkey-AI/mcp-tool-filter) library.
