# MCP Tool Flow - Complete Architecture

## Overview

This document describes the complete MCP (Model Context Protocol) tool flow architecture that enables Claude.ai to access 350+ tools while maintaining minimal token usage.

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLAUDE.AI                                    │
│                                                                           │
│                    Sees only 3 meta-tools (~800 tokens):                  │
│                    • search_tools(query)                                  │
│                    • execute_tool(name, args)                             │
│                    • list_all_tools()                                     │
└────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS (Claude.ai Connector)
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         TRAEFIK (VPS1 or VPS2)                            │
│                         mcp.yourdomain.com                                │
│                         SSL Termination                                   │
└────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTP
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │       LAYER 1: mcp-front                 │
                   │           (Port 8088)                    │
                   │                                          │
                   │   • Google OAuth 2.0 authentication      │
                   │   • JWT token issuance & validation      │
                   │   • Routes to tool-filter                │
                   └─────────────────────────────────────────┘
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │    LAYER 2: mcp-tool-filter-cf           │
                   │           (Port 8098)                    │
                   │                                          │
                   │   • Exposes 3 meta-tools only            │
                   │   • Semantic search (MiniLM embeddings)  │
                   │   • 95% token reduction                  │
                   └─────────────────────────────────────────┘
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │      LAYER 3: mcp-name-bridge            │
                   │         (Port 8080 internal)             │
                   │                                          │
                   │   • Translates naming conventions        │
                   │   • github__tool ↔ github-tool           │
                   └─────────────────────────────────────────┘
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │        LAYER 4: Context Forge            │
                   │       (Port 4444 admin, 8099 MCP)        │
                   │                                          │
                   │   • Aggregates 22+ MCP servers           │
                   │   • Routes tool calls to backends        │
                   │   • Admin UI for management              │
                   └─────────────────────────────────────────┘
                                        │
           ┌─────────────────────────────┼─────────────────────────────┐
           ▼                             ▼                             ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    Filesystem   │   │      GitHub      │   │   mcp-gateway   │
│       Git       │   │      Slack       │   │                 │
│    PostgreSQL   │   │    LinkedIn      │   │  ssh_execute    │
│      Fetch      │   │    Puppeteer     │   │  ssh_read_file  │
│   BraveSearch   │   │   Browserless    │   │  ssh_write_file │
│      Docker     │   │    Context7      │   │  container_*    │
│     Memory      │   │      ...         │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

## Layer Details

### Layer 1: mcp-front (OAuth Gateway)

**Purpose:** Secure access to MCP endpoints via OAuth 2.0

**Responsibilities:**
- Handle Google OAuth 2.0 flow
- Issue and validate JWT tokens
- Route authenticated requests downstream
- Support Claude.ai connector protocol

**Key Endpoints:**
- `/.well-known/oauth-authorization-server` - OAuth discovery
- `/oauth/authorize` - Start OAuth flow
- `/oauth/callback` - OAuth callback
- `/mcp/sse` - MCP over SSE
- `/mcp` - MCP over HTTP

### Layer 2: mcp-tool-filter-cf (Semantic Filter)

**Purpose:** Reduce token usage through semantic tool discovery

**How it works:**
1. Fetches all tools from downstream on startup
2. Builds semantic embeddings using local MiniLM model
3. Exposes only 3 meta-tools to Claude
4. Claude searches for tools when needed
5. Filter returns top-K semantically similar tools
6. Claude executes via `execute_tool`

**Meta-tools exposed:**
```
search_tools(query, limit?)     - Find tools by description
execute_tool(tool_name, args)   - Execute any tool
list_all_tools(page, per_page)  - Browse all tools
```

### Layer 3: mcp-name-bridge (Convention Converter)

**Purpose:** Translate between naming conventions

**Problem:** 
- Context Forge uses slug format: `github-get-pull-request`
- Tool filter expects double-underscore: `github__get_pull_request`

**Transformations:**
```
tools/list response:  github-get-pull-request → github__get_pull_request
tools/call request:   github__get_pull_request → github-get-pull-request
```

### Layer 4: Context Forge (Gateway Aggregator)

**Purpose:** Aggregate multiple MCP servers into unified endpoint

**Features:**
- Register unlimited MCP servers
- Supports SSE and Streamable HTTP transports
- Admin UI for gateway management
- Routes tool calls to appropriate backend

## Request Flow Example

### Searching for a Tool

```
1. Claude calls: search_tools({"query": "read file from disk"})
   │
2. mcp-front: Validates JWT, routes to tool-filter
   │
3. mcp-tool-filter: Performs semantic search
   │ → Returns: [{name: "filesystem__read_file", score: 0.89}, ...]
   │
4. Claude receives: Top 15 matching tools with descriptions
```

### Executing a Tool

```
1. Claude calls: execute_tool({tool_name: "filesystem__read_file", arguments: {path: "/etc/hostname"}})
   │
2. mcp-front: Validates JWT, routes to tool-filter
   │
3. mcp-tool-filter: Forwards to name-bridge
   │
4. mcp-name-bridge: Converts "filesystem__read_file" → "filesystem-read-file"
   │
5. Context Forge: Routes to Filesystem gateway
   │
6. Filesystem MCP: Reads /etc/hostname
   │
7. Response flows back through chain
   │
8. Claude receives: File contents
```

## Token Analysis

### Without Tool Filter
```
350 tools × ~115 tokens/tool = ~40,000 tokens
Plus conversation = Limited context for actual work
```

### With Tool Filter
```
3 meta-tools × ~250 tokens/tool = ~800 tokens
Plus conversation = Maximum context for work

Token reduction: 98%
```

## Network Configuration

### Docker Network

All components communicate over shared Docker network:

```bash
docker network create mcp-network
```

### Port Mapping

| Service | Container Port | Host Port | Purpose |
|---------|---------------|-----------|----------|
| mcp-front | 8080 | 8088 | OAuth gateway |
| mcp-tool-filter-cf | 8080 | 8098 | Tool filter |
| mcp-name-bridge | 8080 | (internal) | Name translation |
| contextforge | 4444 | 4444 | Admin API |
| contextforge | 8080 | 8099 | MCP endpoint |
| mcp-gateway | 8086 | 8086 | SSH tools |

### Service Discovery

Containers reference each other by name:
```
mcp-front → http://mcp-tool-filter-cf:8080/mcp
mcp-tool-filter-cf → http://mcp-name-bridge:8080/mcp
mcp-name-bridge → http://contextforge:4444/rpc
```

## Deployment Order

1. **Context Forge** - Must be running first (aggregator)
2. **MCP Servers** - Register with Context Forge
3. **mcp-name-bridge** - Connects to Context Forge
4. **mcp-tool-filter** - Connects to name-bridge
5. **mcp-front** - Connects to tool-filter
6. **Traefik** - Routes external traffic to mcp-front

## Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| mcp-front | /.well-known/oauth-authorization-server | OAuth metadata |
| mcp-tool-filter | /health | {status: "healthy", toolsLoaded: N} |
| mcp-name-bridge | /health | {status: "healthy", upstream: "..."} |
| contextforge | /health | {status: "ok"} |
| mcp-gateway | /health | {status: "healthy", ssh: {connected: N}} |

## Troubleshooting

### Tools Not Showing
1. Check Context Forge has gateways: `curl -u admin:PASS http://localhost:4444/gateways`
2. Check tool-filter logs: `docker logs mcp-tool-filter-cf`
3. Verify name-bridge health: `curl http://localhost:8080/health`

### OAuth Errors
1. Verify Google OAuth credentials
2. Check redirect URI configuration
3. Review mcp-front logs

### SSH Tools Not Working
1. Ensure mcp-gateway registered with Context Forge
2. Check SSH key permissions (should be 600)
3. Verify SSH connectivity: `docker exec mcp-gateway cat /app/src/index.js`

## Security Considerations

1. **OAuth tokens** - Short-lived, validated on every request
2. **SSH keys** - Mounted read-only, never exposed
3. **Admin API** - Protected by basic auth
4. **Network** - Internal Docker network, not exposed
5. **SSL** - Terminated at Traefik, required for external access
