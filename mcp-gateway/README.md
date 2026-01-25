# mcp-gateway - SSH & VPS Tools

Custom MCP server that provides persistent SSH connections and container management tools.

## Purpose

Standard MCP servers using stdio transport spawn fresh processes per tool call, losing connection state. This gateway maintains persistent SSH connection pools for:

- **SSH command execution** - Run commands on remote servers
- **File operations** - Read/write files via SSH
- **Container management** - List, restart, view logs of Docker containers

## Tools Provided (9 total)

### SSH Tools

| Tool | Description |
|------|-------------|
| `ssh_execute` | Execute shell command on remote server |
| `ssh_read_file` | Read file contents from remote server |
| `ssh_write_file` | Write content to file on remote server |
| `ssh_list_servers` | List configured SSH servers and status |
| `ssh_server_status` | Get detailed SSH connection status |

### Container Tools

| Tool | Description |
|------|-------------|
| `container_list` | List Docker containers on remote server |
| `container_logs` | Get container logs |
| `container_restart` | Restart a container |

### Utility Tools

| Tool | Description |
|------|-------------|
| `gateway_info` | Get gateway status and uptime |

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with SSH status |
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/mcp/sse` | GET | SSE transport |
| `/info` | GET | Gateway information |
| `/tools` | GET | List available tools |

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Listen port (default: 8086) |
| SERVER_NAME | Gateway name for MCP protocol |
| SSH_SERVERS | Comma-separated server names |
| SSH_{NAME}_HOST | SSH host for server |
| SSH_{NAME}_USER | SSH username (default: root) |
| SSH_{NAME}_KEY | Path to SSH private key |
| SSH_{NAME}_PORT | SSH port (default: 22) |

## Docker Compose

```yaml
services:
  mcp-gateway:
    build: .
    container_name: mcp-gateway
    restart: unless-stopped
    ports:
      - "8086:8086"
    environment:
      - PORT=8086
      - SERVER_NAME=mcp-gateway
      - SSH_SERVERS=vps1,vps2
      - SSH_VPS1_HOST=72.60.31.69
      - SSH_VPS1_USER=root
      - SSH_VPS1_KEY=/ssh/id_ed25519
      - SSH_VPS2_HOST=72.60.225.81
      - SSH_VPS2_USER=root
      - SSH_VPS2_KEY=/ssh/id_ed25519
    volumes:
      - /root/.ssh:/ssh:ro
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8086/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  mcp-network:
    external: true
```

## Health Check Response

```json
{
  "status": "healthy",
  "uptime": 12345,
  "ssh": {
    "connected": 2,
    "total": 2
  }
}
```

## Tool Examples

### Execute SSH Command

```json
{
  "name": "ssh_execute",
  "arguments": {
    "server": "vps2",
    "command": "docker ps --format 'table {{.Names}}\t{{.Status}}'"
  }
}
```

### Read Remote File

```json
{
  "name": "ssh_read_file",
  "arguments": {
    "server": "vps1",
    "path": "/etc/hostname"
  }
}
```

### Write Remote File

```json
{
  "name": "ssh_write_file",
  "arguments": {
    "server": "vps2",
    "path": "/tmp/test.txt",
    "content": "Hello from MCP!"
  }
}
```

### List Containers

```json
{
  "name": "container_list",
  "arguments": {
    "server": "vps2",
    "all": true
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              mcp-gateway (Port 8086)            │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │           SSH Connection Pool            │   │
│  │                                          │   │
│  │   VPS1 (72.60.31.69) ◄──┐               │   │
│  │                         │ Persistent    │   │
│  │   VPS2 (72.60.225.81) ◄─┘ Connections   │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │         MCP Protocol Handler             │   │
│  │                                          │   │
│  │   • tools/list  → Return tool schemas   │   │
│  │   • tools/call  → Execute tool          │   │
│  │   • initialize  → Protocol handshake    │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Source Files

| File | Purpose |
|------|----------|
| `src/index.js` | Express server & MCP protocol |
| `src/ssh-pool.js` | SSH connection pool manager |
| `src/tools.js` | Tool definitions & handlers |

## Registering with Context Forge

```bash
curl -X POST http://localhost:4444/gateways \
  -u admin:YOUR_PASSWORD \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gateway",
    "url": "http://mcp-gateway:8086/mcp",
    "transport": "STREAMABLEHTTP"
  }'
```
