import express from 'express';
import { MCPToolFilter } from '@portkey-ai/mcp-tool-filter';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

const MCPJUNGLE_URL = process.env.MCPJUNGLE_URL || 'http://mcpjungle:8080';
const MCPJUNGLE_TOKEN = process.env.MCPJUNGLE_TOKEN || '';
const PORT = process.env.PORT || 8080;
const TOP_K = parseInt(process.env.TOP_K || '15');

let filter = null;
let allTools = [];
let mcpServers = [];  // MCPServer format for the filter
let mcpSessionId = null;
let initialized = false;

// SSE sessions for bidirectional communication
const sseSessions = new Map();

// Initialize MCP session with upstream
async function initMCPSession() {
  console.log('Initializing MCP session with upstream...');
  
  const headers = { 'Content-Type': 'application/json' };
  if (MCPJUNGLE_TOKEN) {
    headers['Authorization'] = `Bearer ${MCPJUNGLE_TOKEN}`;
  }
  
  try {
    const response = await fetch(`${MCPJUNGLE_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-tool-filter', version: '1.0.0' }
        }
      })
    });
    
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) {
      mcpSessionId = sessionId;
      console.log(`MCP Session established: ${sessionId}`);
      return true;
    }
    console.log('MCP connected (no session ID)');
    return true;
  } catch (error) {
    console.error('Failed to connect to upstream:', error.message);
  }
  return false;
}

// Fetch tools from upstream and organize into MCPServer format
async function fetchTools() {
  const headers = { 'Content-Type': 'application/json' };
  if (MCPJUNGLE_TOKEN) {
    headers['Authorization'] = `Bearer ${MCPJUNGLE_TOKEN}`;
  }
  if (mcpSessionId) {
    headers['mcp-session-id'] = mcpSessionId;
  }
  
  try {
    const response = await fetch(`${MCPJUNGLE_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    });
    
    const data = await response.json();
    if (data.result && data.result.tools) {
      allTools = data.result.tools;
      
      // Organize tools by server (tools are named: servername__toolname)
      const serverMap = new Map();
      
      allTools.forEach(tool => {
        const parts = tool.name.split('__');
        const serverName = parts.length > 1 ? parts[0] : 'default';
        const toolName = parts.length > 1 ? parts.slice(1).join('__') : tool.name;
        
        if (!serverMap.has(serverName)) {
          serverMap.set(serverName, {
            id: serverName,
            name: serverName,
            description: `MCP server: ${serverName}`,
            tools: []
          });
        }
        
        serverMap.get(serverName).tools.push({
          name: tool.name,  // Keep full name for execution
          description: tool.description || `Tool ${toolName} from ${serverName}`,
          inputSchema: tool.inputSchema
        });
      });
      
      mcpServers = Array.from(serverMap.values());
      console.log(`Loaded ${allTools.length} tools from ${mcpServers.length} servers`);
      return true;
    }
  } catch (error) {
    console.error('Failed to fetch tools:', error.message);
  }
  return false;
}

// Initialize the semantic filter
async function initializeFilter() {
  console.log('Initializing semantic filter with local embeddings...');
  
  try {
    // Create filter with LOCAL embeddings (no API key needed!)
    filter = new MCPToolFilter({
      embedding: {
        provider: 'local',
        model: 'Xenova/all-MiniLM-L6-v2',  // Small, fast model (~25MB)
        quantized: true  // Faster inference
      },
      defaultOptions: {
        topK: TOP_K,
        minScore: 0.3
      },
      debug: false
    });
    
    // Initialize with our servers (this downloads the model on first run)
    console.log('Loading embedding model (first run downloads ~25MB)...');
    await filter.initialize(mcpServers);
    console.log('Semantic filter initialized successfully!');
    return true;
  } catch (error) {
    console.error('Failed to initialize semantic filter:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Execute a tool on upstream
async function executeTool(toolName, args = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (MCPJUNGLE_TOKEN) {
    headers['Authorization'] = `Bearer ${MCPJUNGLE_TOKEN}`;
  }
  if (mcpSessionId) {
    headers['mcp-session-id'] = mcpSessionId;
  }
  
  try {
    const response = await fetch(`${MCPJUNGLE_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      })
    });
    
    return await response.json();
  } catch (error) {
    return { error: { message: error.message } };
  }
}

// Meta tools exposed by this filter
const META_TOOLS = [
  {
    name: 'search_tools',
    description: 'Search for relevant MCP tools based on your query. Returns the most semantically similar tools. Call this first to discover what tools are available for your task.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what you want to do (e.g., "read files", "search github", "query database")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tools to return (default: 15)',
          default: 15
        }
      },
      required: ['query']
    }
  },
  {
    name: 'execute_tool',
    description: 'Execute an MCP tool by name. Use search_tools first to find the right tool, then call this with the tool name and arguments.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'The exact name of the tool to execute (from search_tools results)'
        },
        arguments: {
          type: 'object',
          description: 'Arguments to pass to the tool'
        }
      },
      required: ['tool_name']
    }
  },
  {
    name: 'list_all_tools',
    description: 'List all available MCP tools without filtering. Use this to see the complete tool inventory.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          default: 1
        },
        per_page: {
          type: 'number',
          description: 'Tools per page (default: 20)',
          default: 20
        }
      }
    }
  }
];

// Handle meta tool execution
async function handleMetaTool(name, args) {
  switch (name) {
    case 'search_tools': {
      const query = args.query || '';
      const limit = args.limit || TOP_K;
      
      if (!filter) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Semantic filter not initialized yet. Please try again in a moment.' }]
        };
      }
      
      try {
        const result = await filter.filter(query, { topK: limit });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              total_available: allTools.length,
              results_count: result.tools.length,
              filter_time_ms: result.metrics.totalTime.toFixed(2),
              results: result.tools.map(t => ({
                name: t.tool.name,
                description: t.tool.description,
                score: t.score.toFixed(3),
                server: t.serverId
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Filter error: ${error.message}` }]
        };
      }
    }
    
    case 'execute_tool': {
      const toolName = args.tool_name;
      const toolArgs = args.arguments || {};
      const result = await executeTool(toolName, toolArgs);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
    
    case 'list_all_tools': {
      const page = args.page || 1;
      const perPage = args.per_page || 20;
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const pageTools = allTools.slice(start, end).map(t => ({
        name: t.name,
        description: t.description
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            page,
            per_page: perPage,
            total_tools: allTools.length,
            total_pages: Math.ceil(allTools.length / perPage),
            servers: mcpServers.map(s => s.name),
            tools: pageTools
          }, null, 2)
        }]
      };
    }
    
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }]
      };
  }
}

// Full initialization sequence
async function initialize() {
  // Step 1: Connect to upstream
  const connected = await initMCPSession();
  if (!connected) {
    console.log('Retrying connection in 5s...');
    setTimeout(initialize, 5000);
    return;
  }
  
  // Step 2: Fetch tools
  const loaded = await fetchTools();
  if (!loaded) {
    console.log('Retrying tool fetch in 5s...');
    setTimeout(initialize, 5000);
    return;
  }
  
  // Step 3: Initialize semantic filter
  const filterReady = await initializeFilter();
  if (!filterReady) {
    console.log('Filter initialization failed, will use keyword fallback');
  }
  
  initialized = true;
  console.log(`Ready! Exposing 3 meta-tools, proxying to ${allTools.length} backend tools`);
  console.log(`Semantic search: ${filter ? 'ENABLED' : 'DISABLED (keyword fallback)'}`);
}

// SSE endpoint (MCP over SSE transport)
app.all('/sse', (req, res) => {
  const sessionId = uuidv4();
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  sseSessions.set(sessionId, { res, created: Date.now() });
  res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);
  
  const keepAlive = setInterval(() => { res.write(': ping\n\n'); }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    sseSessions.delete(sessionId);
  });
});

// Message endpoint for SSE transport
app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sseSessions.get(sessionId);
  
  if (!session) {
    return res.status(400).json({ error: 'Invalid session' });
  }
  
  const message = req.body;
  let response;
  
  try {
    if (message.method === 'initialize') {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'mcp-tool-filter', version: '1.0.0' },
          capabilities: { tools: {} }
        }
      };
    } else if (message.method === 'tools/list') {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: { tools: META_TOOLS }
      };
    } else if (message.method === 'tools/call') {
      const result = await handleMetaTool(message.params.name, message.params.arguments || {});
      response = { jsonrpc: '2.0', id: message.id, result };
    } else if (message.method === 'notifications/initialized') {
      return res.status(202).send();
    } else {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` }
      };
    }
  } catch (error) {
    response = {
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: error.message }
    };
  }
  
  session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  res.status(202).send();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: initialized ? 'healthy' : 'initializing',
    toolsLoaded: allTools.length,
    serversConnected: mcpServers.length,
    semanticFilterReady: !!filter,
    sessionActive: !!mcpSessionId,
    sseConnections: sseSessions.size
  });
});

// JSON-RPC endpoint (for direct access)
app.post('/mcp', async (req, res) => {
  const message = req.body;
  let response;
  
  try {
    if (message.method === 'initialize') {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'mcp-tool-filter', version: '1.0.0' },
          capabilities: { tools: {} }
        }
      };
    } else if (message.method === 'tools/list') {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: { tools: META_TOOLS }
      };
    } else if (message.method === 'tools/call') {
      const result = await handleMetaTool(message.params.name, message.params.arguments || {});
      response = { jsonrpc: '2.0', id: message.id, result };
    } else {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` }
      };
    }
  } catch (error) {
    response = {
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: error.message }
    };
  }
  
  res.json(response);
});

// Start server
app.listen(PORT, () => {
  console.log(`MCP Tool Filter starting on port ${PORT}`);
  console.log(`SSE endpoint: /sse`);
  console.log(`JSON-RPC endpoint: /mcp`);
  console.log(`Using local embeddings (Xenova/all-MiniLM-L6-v2)`);
  initialize();
});
