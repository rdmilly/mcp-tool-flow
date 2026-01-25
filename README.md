# MCP Tool Flow Architecture

> Complete self-hosted MCP (Model Context Protocol) infrastructure for Claude.ai integration with **95% token reduction**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

This repository documents the complete MCP tool flow architecture that enables Claude.ai to access 350+ tools while consuming only ~800 tokens (instead of ~40,000).

```
Claude.ai → mcp-front (OAuth) → mcp-tool-filter (semantic) → mcp-name-bridge → Context Forge → [22 MCP servers]
```

## Why This Architecture?

### Problem: Token Explosion
Connecting Claude.ai directly to 350+ tools would consume ~40,000 tokens before any conversation starts, severely limiting conversation length.

### Solution: 4-Layer Architecture
1. **OAuth Gateway** - Secure authentication via Google OAuth
2. **Semantic Tool Filter** - Exposes only 3 meta-tools, finds relevant tools on-demand
3. **Name Bridge** - Translates naming conventions between systems
4. **Context Forge** - Aggregates all MCP servers into unified endpoint

### Result
| Metric | Before | After | Savings |
|--------|--------|-------|--------|
| Token Usage | ~40,000 | ~800 | **98%** |
| Tools Visible | 350+ | 3 | Semantic search |
| Security | None | OAuth 2.0 | Enterprise-ready |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLAUDE.AI                                │
│              Sees only 3 tools (~800 tokens):                    │
│         search_tools, execute_tool, list_all_tools               │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    mcp.millyweb.com                              │
│              Traefik (SSL Termination)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 mcp-front (Port 8088)                            │
│                                                                  │
│  • Google OAuth 2.0 authentication                               │
│  • JWT token validation                                          │
│  • Routes to tool-filter                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              mcp-tool-filter-cf (Port 8098)                      │
│                 TOKEN OPTIMIZATION LAYER                         │
│                                                                  │
│  • Exposes only 3 meta-tools to Claude                           │
│  • search_tools(query) - Semantic search with embeddings         │
│  • execute_tool(name, args) - Execute any tool by name           │
│  • list_all_tools() - Browse all available tools                 │
│  • Uses local MiniLM embeddings (no API key needed)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               mcp-name-bridge (Port 8080)                        │
│                 CONVENTION CONVERTER                             │
│                                                                  │
│  • Translates tool names between systems                         │
│  • gateway__ssh_execute → gateway-ssh-execute                    │
│  • Handles Context Forge slug conventions                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             Context Forge (Port 4444/8099)                       │
│                 MCP GATEWAY AGGREGATOR                           │
│                                                                  │
│  • IBM's open-source MCP gateway                                 │
│  • Aggregates 22 MCP servers                                     │
│  • 350+ tools available                                          │
│  • Admin UI at :4444                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Filesystem  │   │    GitHub     │   │  mcp-gateway  │
│     Git       │   │    Slack      │   │   (SSH/VPS)   │
│   PostgreSQL  │   │   LinkedIn    │   │               │
│     Fetch     │   │   Puppeteer   │   │ • ssh_execute │
│  BraveSearch  │   │  Browserless  │   │ • ssh_read    │
│     ...       │   │     ...       │   │ • ssh_write   │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Domain with DNS pointing to your server
- Google OAuth credentials (for authentication)
- Traefik reverse proxy (or similar)

### 1. Clone Repository
```bash
git clone https://github.com/rdmilly/mcp-tool-flow.git
cd mcp-tool-flow
```

### 2. Deploy Context Forge (MCP Aggregator)
```bash
cd contextforge
cp .env.example .env
# Edit .env with your credentials
docker-compose up -d
```

### 3. Deploy Name Bridge
```bash
cd ../mcp-name-bridge
docker-compose up -d
```

### 4. Deploy Tool Filter
```bash
cd ../mcp-tool-filter
cp .env.example .env
# Edit .env
docker-compose up -d
```

### 5. Deploy OAuth Gateway
```bash
cd ../mcp-front
cp .env.example .env
# Edit .env with Google OAuth credentials
docker-compose up -d
```

### 6. Register in Claude.ai
1. Go to Claude.ai Settings → Connectors
2. Add custom connector: `https://your-domain.com/mcp/sse`
3. Complete OAuth flow
4. Start using 350+ tools!

## Components

| Component | Port | Purpose | Documentation |
|-----------|------|---------|---------------|
| mcp-front | 8088 | OAuth gateway | [mcp-front/README.md](mcp-front/README.md) |
| mcp-tool-filter | 8098 | Semantic filtering | [mcp-tool-filter/README.md](mcp-tool-filter/README.md) |
| mcp-name-bridge | 8080 | Name translation | [mcp-name-bridge/README.md](mcp-name-bridge/README.md) |
| contextforge | 4444, 8099 | MCP aggregation | [contextforge/README.md](contextforge/README.md) |
| mcp-gateway | 8086 | SSH/VPS tools | [mcp-gateway/README.md](mcp-gateway/README.md) |

## Registered MCP Servers (22 total)

| Server | Tools | Description |
|--------|-------|-------------|
| Filesystem | 15+ | File operations |
| Git | 10+ | Git operations |
| PostgreSQL | 10+ | Database queries |
| GitHub | 30+ | Repository management |
| Slack | 15+ | Messaging |
| Docker | 20+ | Container management |
| Puppeteer | 10+ | Browser automation |
| Browserless | 5+ | Headless browsing |
| LinkedIn | 5+ | Social posting |
| Gateway (SSH) | 9 | SSH/VPS management |
| ...and 12 more | | |

## API Reference

### Tool Filter Endpoints

```bash
# Health check
curl http://localhost:8098/health

# List all tools (paginated)
curl -X POST http://localhost:8098/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Context Forge Admin API

```bash
# List gateways
curl -u admin:PASSWORD http://localhost:4444/gateways

# Register new gateway
curl -X POST http://localhost:4444/gateways \
  -u admin:PASSWORD \
  -H "Content-Type: application/json" \
  -d '{"name":"MyServer","url":"http://server:8080/mcp","transport":"STREAMABLEHTTP"}'

# List all tools
curl -u admin:PASSWORD "http://localhost:4444/tools?limit=500"
```

## Network Configuration

All components communicate over a shared Docker network:

```yaml
networks:
  mcp-network:
    external: true
```

Create it once:
```bash
docker network create mcp-network
```

## Troubleshooting

### Tools not showing up
1. Check Context Forge has gateways registered: `curl -u admin:PASS http://localhost:4444/gateways`
2. Check tool-filter can reach name-bridge: `docker logs mcp-tool-filter-cf`
3. Verify name-bridge health: `curl http://localhost:8080/health`

### OAuth not working
1. Verify Google OAuth credentials in mcp-front .env
2. Check redirect URI matches your domain
3. Review mcp-front logs: `docker logs mcp-front`

### SSH tools failing
1. Verify mcp-gateway is registered with Context Forge
2. Check SSH keys are mounted: `docker exec mcp-gateway ls /ssh`
3. Test SSH connection: `docker exec mcp-gateway cat /app/src/index.js`

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

- [IBM Context Forge](https://github.com/IBM/mcp-context-forge) - MCP gateway aggregator
- [Portkey MCP Tool Filter](https://github.com/Portkey-AI/mcp-tool-filter) - Semantic filtering library
- [mcp-front](https://github.com/dgellow/mcp-front) - OAuth gateway

---

*Built by [Ryan Milly](https://github.com/rdmilly) as part of the [Millyweb](https://millyweb.com) AI infrastructure project.*