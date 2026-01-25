# MCP Tool Flow - Deployment Guide

Step-by-step guide to deploy the complete MCP tool flow stack.

## Prerequisites

- Docker & Docker Compose
- Domain name with DNS pointed to your server
- SSL certificate (via Traefik or similar)
- Google Cloud Console account (for OAuth)

## Quick Start (5 steps)

### 1. Create Docker Network

```bash
docker network create mcp-network
```

### 2. Deploy Context Forge (Aggregator)

```bash
mkdir -p /opt/stacks/contextforge && cd /opt/stacks/contextforge

# Create .env
cat > .env << 'EOF'
CONTEXTFORGE_PASSWORD=YourSecurePassword123!
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
EOF

# Download docker-compose.yml from repo
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/contextforge/docker-compose.yml

docker compose up -d
```

Verify: `curl http://localhost:4444/health`

### 3. Deploy MCP Servers & Register with Context Forge

Deploy your MCP servers (filesystem, github, etc.) and register them:

```bash
# Example: Register filesystem server
curl -X POST http://localhost:4444/gateways \
  -u admin:YourSecurePassword123! \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Filesystem",
    "url": "http://mcp-filesystem:8080/sse",
    "transport": "SSE"
  }'
```

### 4. Deploy Name Bridge + Tool Filter

```bash
# Name Bridge
mkdir -p /opt/stacks/mcp-name-bridge && cd /opt/stacks/mcp-name-bridge
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-name-bridge/index.js
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-name-bridge/Dockerfile
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-name-bridge/docker-compose.yml
docker compose up -d --build

# Tool Filter
mkdir -p /opt/stacks/mcp-tool-filter && cd /opt/stacks/mcp-tool-filter
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-tool-filter/server.js
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-tool-filter/package.json
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-tool-filter/Dockerfile
curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-tool-filter/docker-compose.yml
docker compose up -d --build
```

### 5. Deploy OAuth Gateway (mcp-front)

```bash
mkdir -p /opt/stacks/mcp-front && cd /opt/stacks/mcp-front

# Create Google OAuth credentials first:
# 1. Go to https://console.cloud.google.com/apis/credentials
# 2. Create OAuth 2.0 Client ID (Web application)
# 3. Add authorized redirect URI: https://mcp.yourdomain.com/oauth/callback

# Create .env
cat > .env << 'EOF'
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
EOF

# Create config.json
cat > config.json << 'EOF'
{
  "version": "v0.0.1-DEV_EDITION_EXPECT_CHANGES",
  "proxy": {
    "baseURL": "https://mcp.yourdomain.com",
    "addr": ":8080",
    "name": "MCP Gateway",
    "auth": {
      "kind": "oauth",
      "issuer": "https://mcp.yourdomain.com",
      "allowedDomains": ["gmail.com"],
      "allowedOrigins": ["https://claude.ai", "capacitor://localhost"],
      "tokenTtl": "168h",
      "storage": "memory",
      "googleClientId": {"$env": "GOOGLE_CLIENT_ID"},
      "googleClientSecret": {"$env": "GOOGLE_CLIENT_SECRET"},
      "googleRedirectUri": "https://mcp.yourdomain.com/oauth/callback",
      "jwtSecret": {"$env": "JWT_SECRET"},
      "encryptionKey": {"$env": "ENCRYPTION_KEY"}
    }
  },
  "mcpServers": {
    "mcp": {
      "transportType": "streamable-http",
      "url": "http://mcp-tool-filter-cf:8080/mcp"
    }
  }
}
EOF

curl -O https://raw.githubusercontent.com/rdmilly/mcp-tool-flow/main/mcp-front/docker-compose.yml
docker compose up -d
```

## Traefik Configuration

Add labels to mcp-front for automatic SSL:

```yaml
services:
  mcp-front:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mcp.rule=Host(`mcp.yourdomain.com`)"
      - "traefik.http.routers.mcp.entrypoints=websecure"
      - "traefik.http.routers.mcp.tls.certresolver=letsencrypt"
      - "traefik.http.services.mcp.loadbalancer.server.port=8080"
```

## Connect Claude.ai

1. Open Claude.ai Settings > Integrations > Connectors
2. Add new connector with URL: `https://mcp.yourdomain.com`
3. Complete OAuth flow
4. You should see 3 tools: `search_tools`, `execute_tool`, `list_all_tools`

## Verify Deployment

```bash
# Check all services
docker ps | grep -E 'contextforge|mcp-|tool-filter'

# Check tool filter health
curl http://localhost:8098/health

# Expected:
# {"status":"healthy","toolsLoaded":354,"serversConnected":22,...}

# Test semantic search
curl -X POST http://localhost:8098/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_tools",
      "arguments": {"query": "read files"}
    }
  }'
```

## Troubleshooting

### Tools not loading
```bash
# Check Context Forge gateways
curl -u admin:PASSWORD http://localhost:4444/gateways

# Check name-bridge connection
curl http://localhost:8080/health

# Check tool-filter logs
docker logs mcp-tool-filter-cf --tail 50
```

### OAuth errors
```bash
# Check mcp-front logs
docker logs mcp-front --tail 50

# Verify redirect URI matches Google Console exactly
```

### Performance issues
```bash
# First semantic search is slow (model download)
# Subsequent searches should be <100ms

# Check model cache
docker exec mcp-tool-filter-cf ls -la /root/.cache
```

## Architecture Diagram

```
Claude.ai
    |
    v (HTTPS)
Traefik (SSL termination)
    |
    v
mcp-front:8088 (OAuth)
    |
    v
mcp-tool-filter-cf:8098 (Semantic Filter)
    |
    v
mcp-name-bridge:8080 (Name Convention)
    |
    v
Context Forge:4444/8099 (Aggregator)
    |
    v
[22+ MCP Servers]
```

## Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| mcp-front | 8088 | OAuth gateway |
| mcp-tool-filter-cf | 8098 | Semantic filter |
| mcp-name-bridge | 8080 (internal) | Name translation |
| contextforge | 4444 | Admin API |
| contextforge | 8099 | MCP endpoint |
