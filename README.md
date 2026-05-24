# MCP Tool Flow Architecture

> Complete self-hosted MCP (Model Context Protocol) infrastructure for Claude.ai integration — OAuth gateway, semantic tool filter, name bridge, and multi-server aggregation. Achieves **95% token reduction** in tool context.

**In plain English:** Claude.ai can connect to external tools via MCP servers. This repo documents the full architecture for running 45+ MCP servers with 697 tools behind a single authenticated gateway — with intelligent filtering so Claude only sees the tools relevant to each task.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## The Problem

Running dozens of MCP servers creates two problems:
1. **Token bloat** — sending all tool definitions to Claude on every request is expensive and slow
2. **Security** — you need OAuth-gated access, not open endpoints

## The Solution

```
Claude.ai
    ↓ OAuth (mcp-front)
Provision Filter  ←  semantic search: "what tools match this request?"
    ↓ only relevant tools passed through
MCP Provisioner   ←  45+ servers, HOT/WARM/COLD pool management
    ↓
Individual MCP Servers (spin up on demand, wind down when idle)
```

---

## Key Components

| Component | Role |
|-----------|------|
| **mcp-front** | OAuth gateway + MCP protocol bridge |
| **provision-filter** | Semantic tool selection (95% token reduction) |
| **mcp-provisioner** | Server lifecycle — HOT/WARM/COLD container pools |
| **name-bridge** | Tool name normalization across servers |

---

## Scale

- 45+ MCP servers managed
- 697 tools registered
- ~2 containers always hot, rest spin up on demand
- Runs on 2-node VPS cluster (Hostinger)

---

## Builder

Ryan Milly — [ryanmilly.com](https://ryanmilly.com) · [LinkedIn](https://linkedin.com/in/rdmilly)
