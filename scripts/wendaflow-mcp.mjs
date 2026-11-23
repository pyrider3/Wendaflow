#!/usr/bin/env node
// Wendaflow MCP server (stdio). Needs the app running: npm run app (or npm run proxy).
//   claude mcp add wendaflow -- node /path/to/Wendaflow/scripts/wendaflow-mcp.mjs
import { createClient } from '../src/agent-api/client.mjs';
import { createMcpHandler, runStdio } from '../src/agent-api/mcp.mjs';

runStdio({ handle: createMcpHandler({ client: createClient() }) });
