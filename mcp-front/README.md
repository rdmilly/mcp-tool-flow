# mcp-front - OAuth Gateway

OAuth 2.0 gateway for securing MCP endpoints. Handles authentication via Google OAuth and routes authenticated requests to downstream MCP servers.

## Purpose

- Provides Google OAuth 2.0 authentication for Claude.ai connectors
- Issues JWT tokens for session management
- Routes authenticated MCP requests to tool-filter

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-authorization-server` | GET | OAuth discovery |
| `/oauth/authorize` | GET | Start OAuth flow |
| `/oauth/callback` | GET | OAuth callback |
| `/mcp/sse` | GET | SSE MCP endpoint |
| `/mcp` | POST | Streamable HTTP MCP endpoint |

## Configuration

### config.json
```json
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
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| GOOGLE_CLIENT_ID | Google OAuth client ID | Yes |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret | Yes |
| JWT_SECRET | Secret for signing JWTs | Yes |
| ENCRYPTION_KEY | Key for encrypting tokens | Yes |

## Setup

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://mcp.yourdomain.com/oauth/callback`
4. Add authorized origins: `https://mcp.yourdomain.com`

### 2. Generate Secrets

```bash
# Generate JWT secret
openssl rand -hex 32

# Generate encryption key (32 bytes)
openssl rand -hex 16
```

### 3. Deploy

```bash
cp .env.example .env
# Edit .env with your credentials
docker-compose up -d
```

## Health Check

```bash
curl http://localhost:8088/.well-known/oauth-authorization-server
```

## Docker Compose

See [docker-compose.yml](docker-compose.yml)

## Source

Based on [dgellow/mcp-front](https://github.com/dgellow/mcp-front)
