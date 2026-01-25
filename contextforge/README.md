# Context Forge - MCP Gateway Aggregator

IBM's open-source MCP gateway that aggregates multiple MCP servers into a single endpoint.

## Purpose

- Aggregates 20+ MCP servers into unified endpoint
- Provides admin UI for gateway management
- Supports SSE and Streamable HTTP transports
- Routes tool calls to appropriate backend servers

## Ports

| Port | Purpose |
|------|----------|
| 4444 | Admin API & UI |
| 8080 | MCP endpoint (/rpc) |

## Endpoints

### Admin API (Port 4444)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/gateways` | GET | List all registered gateways |
| `/gateways` | POST | Register new gateway |
| `/gateways/{id}` | DELETE | Remove gateway |
| `/tools` | GET | List all tools across gateways |
| `/health` | GET | Health check |
| `/ui` | GET | Admin web UI |

### MCP Endpoint (Port 8080)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rpc` | POST | MCP JSON-RPC endpoint |
| `/sse` | GET | SSE transport |

## Registering Gateways

### Via Admin API

```bash
# Register SSE gateway
curl -X POST http://localhost:4444/gateways \
  -u admin:YOUR_PASSWORD \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub",
    "url": "http://mcp-github:8080/sse",
    "transport": "SSE"
  }'

# Register Streamable HTTP gateway
curl -X POST http://localhost:4444/gateways \
  -u admin:YOUR_PASSWORD \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gateway",
    "url": "http://mcp-gateway:8086/mcp",
    "transport": "STREAMABLEHTTP"
  }'
```

### List Gateways

```bash
curl -u admin:YOUR_PASSWORD http://localhost:4444/gateways
```

### List All Tools

```bash
curl -u admin:YOUR_PASSWORD "http://localhost:4444/tools?limit=500"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| HOST | 0.0.0.0 | Listen host |
| PORT | 4444 | Admin API port |
| BASIC_AUTH_USER | admin | Admin username |
| BASIC_AUTH_PASSWORD | (required) | Admin password |
| DATABASE_URL | sqlite:///data/mcp.db | Database location |
| CORS_ORIGINS | * | CORS allowed origins |
| LOG_LEVEL | INFO | Log verbosity |

## Docker Compose

```yaml
services:
  contextforge:
    image: ghcr.io/ibm/mcp-context-forge:latest
    container_name: contextforge
    restart: unless-stopped
    ports:
      - "4444:4444"
      - "8099:8080"
    environment:
      - HOST=0.0.0.0
      - PORT=4444
      - MCPGATEWAY_ADMIN_API_ENABLED=true
      - MCPGATEWAY_UI_ENABLED=true
      - AUTH_REQUIRED=false
      - DOCS_ALLOW_BASIC_AUTH=true
      - BASIC_AUTH_USER=admin
      - BASIC_AUTH_PASSWORD=${CONTEXTFORGE_PASSWORD}
      - CORS_ORIGINS=*
      - LOG_LEVEL=INFO
      - DATABASE_URL=sqlite:////app/app/data/mcp.db
    volumes:
      - contextforge-data:/app/app/data
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:4444/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  contextforge-data:

networks:
  mcp-network:
    external: true
```

## Tool Naming Convention

Context Forge generates tool names using the gateway slug:

```
{gateway-slug}-{tool-name-with-dashes}
```

Examples:
- `github-get-pull-request`
- `filesystem-read-file`
- `gateway-ssh-execute`

This is why `mcp-name-bridge` is needed to convert to double-underscore format.

## Supported MCP Servers

Currently registered (22 servers, 350+ tools):

| Server | Tools | Description |
|--------|-------|-------------|
| Filesystem | 15+ | File operations |
| Git | 10+ | Git operations |
| PostgreSQL | 10+ | Database queries |
| Fetch | 5+ | HTTP requests |
| BraveSearch | 3+ | Web search |
| Slack | 15+ | Messaging |
| Memory | 5+ | Knowledge graph |
| Docker | 20+ | Container management |
| SequentialThinking | 5+ | Reasoning chains |
| Cloudflare | 30+ | DNS & CDN |
| Time | 3+ | Timezone utilities |
| SQLite | 8+ | Local database |
| GitHub | 30+ | Repository management |
| LinkedIn | 5+ | Social posting |
| Puppeteer | 10+ | Browser automation |
| Browserless | 5+ | Headless browsing |
| Context7 | 10+ | Library docs |
| MCPJungle | varies | Additional aggregator |
| Gateway | 9 | SSH/VPS tools |
| ...and more | | |

## Credits

[IBM MCP Context Forge](https://github.com/IBM/mcp-context-forge)
