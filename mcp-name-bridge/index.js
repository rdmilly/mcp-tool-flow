/**
 * MCP Name Bridge - Translates between Context Forge and double-underscore naming conventions
 * 
 * Handles all Context Forge gateways:
 * - Direct gateways: github-get-pull-request → github__get_pull_request
 */

const http = require('http');

// Configuration
const UPSTREAM_URL = process.env.UPSTREAM_URL || 'http://contextforge:4444';
const PORT = process.env.PORT || 8080;

// Name conversion functions
function contextForgeToDoubleUnderscore(cfName) {
  // Handle direct gateways: github-get-pull-request → github__get_pull_request
  const firstDash = cfName.indexOf('-');
  if (firstDash > 0) {
    const gateway = cfName.slice(0, firstDash);
    const tool = cfName.slice(firstDash + 1).replace(/-/g, '_');
    return `${gateway}__${tool}`;
  }
  
  return cfName;
}

function doubleUnderscoreToContextForge(mjName) {
  // Split on double underscore
  const doubleDashIdx = mjName.indexOf('__');
  if (doubleDashIdx < 0) return mjName;
  
  const server = mjName.slice(0, doubleDashIdx);
  const tool = mjName.slice(doubleDashIdx + 2);
  
  // Direct gateway: github__get_pull_request → github-get-pull-request
  const toolDashed = tool.replace(/_/g, '-');
  return `${server}-${toolDashed}`;
}

// Transform tools/list response
function transformToolsList(response) {
  if (!response?.result?.tools) return response;
  
  response.result.tools = response.result.tools.map(tool => ({
    ...tool,
    name: contextForgeToDoubleUnderscore(tool.name)
  }));
  return response;
}

// Transform tools/call request
function transformToolsCall(request) {
  if (!request?.params?.name) return request;
  
  const originalName = request.params.name;
  request.params.name = doubleUnderscoreToContextForge(request.params.name);
  console.log(`[CALL] ${originalName} → ${request.params.name}`);
  return request;
}

async function handleMcpRequest(req, res, body) {
  try {
    let request = JSON.parse(body);
    const method = request.method;

    // Transform outgoing request
    if (method === 'tools/call') {
      request = transformToolsCall(request);
    }

    // Build upstream URL
    const upstreamPath = '/rpc';

    // Forward to upstream
    const upstreamUrl = new URL(upstreamPath, UPSTREAM_URL);
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(request)
    });

    let response = await upstreamRes.json();

    // Transform incoming response
    if (method === 'tools/list') {
      const beforeCount = response?.result?.tools?.length || 0;
      response = transformToolsList(response);
      console.log(`[LIST] Transformed ${beforeCount} tools`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));

  } catch (err) {
    console.error('Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: err.message }
    }));
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', upstream: UPSTREAM_URL }));
    return;
  }

  // Handle MCP requests on / or /mcp
  if (req.method === 'POST' && (url.pathname === '/' || url.pathname === '/mcp')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => handleMcpRequest(req, res, body));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`MCP Name Bridge running on port ${PORT}`);
  console.log(`Upstream: ${UPSTREAM_URL}/rpc`);
  console.log(`Endpoints: / and /mcp`);
  console.log('');
  console.log('Name transformations (examples):');
  console.log('  github-get-pull-request → github__get_pull_request');
  console.log('  gateway-ssh-execute → gateway__ssh_execute');
});
