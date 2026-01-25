# mcp-name-bridge - Convention Converter

Translates tool names between different MCP naming conventions. Required because Context Forge uses slug-based names (dashes) while the tool filter expects double-underscore convention.

## Purpose

Context Forge generates tool names like:
- `github-get-pull-request`
- `filesystem-read-file`

But the tool filter (and Claude.ai) expects:
- `github__get_pull_request`
- `filesystem__read_file`

This bridge handles bidirectional translation.

## Transformations

### tools/list Response (Context Forge → Tool Filter)
```
github-get-pull-request  →  github__get_pull_request
slack-post-message       →  slack__post_message
gateway-ssh-execute      →  gateway__ssh_execute
```

### tools/call Request (Tool Filter → Context Forge)
```
github__get_pull_request  →  github-get-pull-request
slack__post_message       →  slack-post-message
gateway__ssh_execute      →  gateway-ssh-execute
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/` | POST | MCP JSON-RPC |
| `/mcp` | POST | MCP JSON-RPC (alias) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| UPSTREAM_URL | http://contextforge:4444 | Context Forge URL |
| PORT | 8080 | Listen port |

## How It Works

1. Receives MCP request from tool-filter
2. For `tools/call`: Converts tool name to Context Forge format
3. Forwards request to Context Forge
4. For `tools/list`: Converts tool names back to double-underscore format
5. Returns response to tool-filter

## Source Code

See [index.js](index.js) for the full implementation.

## Docker Compose

```yaml
services:
  mcp-name-bridge:
    build: .
    container_name: mcp-name-bridge
    restart: unless-stopped
    environment:
      - UPSTREAM_URL=http://contextforge:4444
      - PORT=8080
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  mcp-network:
    external: true
```

## Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY index.js .
EXPOSE 8080
CMD ["node", "index.js"]
```

## Testing

```bash
# Health check
curl http://localhost:8080/health

# Test tools/list
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
