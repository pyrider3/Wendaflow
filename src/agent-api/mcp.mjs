// MCP server (stdio, newline-delimited JSON-RPC 2.0) exposing Wendaflow to
// agents such as Claude Code, Codex and Cursor. Every tool is one call to the
// running app's agent API, so the open browser tab shows each change live.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

export const SERVER_INFO = { name: 'wendaflow', version: '0.2.15' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = `Wendaflow is a branching AI thinking canvas. Cards ("nodes") form a tree through parentId; a card may also have extraParentIds, extra parent lines whose branches merge into its context.
Typical flow: status → create_canvas (or list_canvases / use the canvas open in the browser) → add_nodes for ideas → ask to branch a question off a card and get the AI answer (context = the card's whole ancestry, including extra parents) → draw for an AI diagram → arrange → export_canvas.
canvasId may be omitted: it defaults to the canvas open in the user's browser. Changes appear live in that browser tab. Prefer add_nodes with refs to build several cards in one call; read with get_canvas (its outline is a compact tree).
Maps must stay readable: one idea per card, a short title (2–12 words) and at most a line or two of content (about 80 characters). When there is more to say, add child cards instead of longer content: prefer three or four levels of short cards over one level of long ones, and keep each card to 3–7 children. Call arrange after adding a batch.`;

const canvasId = { type: 'string', description: 'Canvas id. Optional: defaults to the canvas currently open in the browser.' };
const parents = {
  parentId: { type: 'string', description: 'Primary parent card id (omit for a new root card).' },
  parentIds: { type: 'array', items: { type: 'string' }, description: 'Several parents: the first is the primary parent, the rest become extra parents whose context merges in.' },
};
const model = { type: 'string', description: 'Optional model: a connection name or model id from list_models, or "ollama:<model>". Defaults to the model selected in the browser.' };
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const TOOLS = [
  { name: 'status', method: 'status', description: 'Check that Wendaflow is running; shows connected browser tabs, the open canvas and the model connections agents may use.', inputSchema: object({}) },
  { name: 'list_models', method: 'models', description: 'List model connections configured in the Wendaflow app (names and model ids only, never keys).', inputSchema: object({}) },
  { name: 'list_canvases', method: 'list_canvases', description: 'List saved canvases (id, name, node count, last update).', inputSchema: object({}) },
  { name: 'create_canvas', method: 'create_canvas', description: 'Create an empty canvas and (by default) open it in the browser.', inputSchema: object({ name: { type: 'string' }, open: { type: 'boolean', description: 'Open it in the browser tab (default true).' } }) },
  { name: 'open_canvas', method: 'open_canvas', description: 'Show a canvas in the user\'s browser tab.', inputSchema: object({ canvasId }, ['canvasId']) },
  { name: 'rename_canvas', method: 'rename_canvas', description: 'Rename a canvas.', inputSchema: object({ canvasId, name: { type: 'string' } }, ['name']) },
  { name: 'get_canvas', method: 'get_canvas', description: 'Read a canvas: every card (id, type, title, content, parentId, extraParentIds, childIds, status) plus an indented outline. Long text is clipped unless full=true.', inputSchema: object({ canvasId, full: { type: 'boolean' } }) },
  { name: 'get_node', method: 'get_node', description: 'Read one card in full, including the complete AI answer.', inputSchema: object({ canvasId, nodeId: { type: 'string' } }, ['nodeId']) },
  { name: 'add_nodes', method: 'add_nodes', description: 'Add idea cards (no AI call). Each item may set a ref; later items can use that ref as a parent, so a whole tree is built in one call. Positions are chosen automatically unless x/y are given. Keep every card short (one idea, a line or two); put further detail in child cards so the map has several levels.', inputSchema: object({ canvasId, nodes: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { ref: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' }, ...parents, x: { type: 'number' }, y: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } } } } }, ['nodes']) },
  { name: 'update_node', method: 'update_node', description: 'Edit a card: title, content, prompt, position, tags, or its parents (parentId / extraParentIds; cycles are rejected).', inputSchema: object({ canvasId, nodeId: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' }, prompt: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, parentId: { type: ['string', 'null'] }, extraParentIds: { type: 'array', items: { type: 'string' } } }, ['nodeId']) },
  { name: 'connect_nodes', method: 'connect_nodes', description: 'Draw a parent line from parentId to childId (multi-parent merge: the child then inherits both branches), or remove it with remove=true.', inputSchema: object({ canvasId, parentId: { type: 'string' }, childId: { type: 'string' }, remove: { type: 'boolean' } }, ['parentId', 'childId']) },
  { name: 'delete_nodes', method: 'delete_nodes', description: 'Delete cards. Children are re-attached to the deleted card\'s parent unless cascade=true deletes the whole subtree.', inputSchema: object({ canvasId, nodeIds: { type: 'array', items: { type: 'string' }, minItems: 1 }, cascade: { type: 'boolean' } }, ['nodeIds']) },
  { name: 'ask', method: 'ask', description: 'Branch a question off a card (or several merged parents) and get the AI answer, streamed live into a new card. Give models (2–6) to race several models side by side. wait=false returns at once; then use wait_for_node.', inputSchema: object({ canvasId, prompt: { type: 'string' }, ...parents, model, models: { type: 'array', items: { type: 'string' }, maxItems: 6 }, wait: { type: 'boolean' }, timeoutMs: { type: 'number' } }, ['prompt']) },
  { name: 'wait_for_node', method: 'wait_for_node', description: 'Wait until a card\'s AI answer is finished, then return the card.', inputSchema: object({ canvasId, nodeId: { type: 'string' }, timeoutMs: { type: 'number' } }, ['nodeId']) },
  { name: 'stop_node', method: 'stop_node', description: 'Stop an AI answer that is still being generated.', inputSchema: object({ canvasId, nodeId: { type: 'string' } }, ['nodeId']) },
  { name: 'draw', method: 'draw', description: 'AI drawing: describe a diagram (flow, mind map, architecture…) and the model draws it as cards and lines next to the existing ones; it may link to existing cards.', inputSchema: object({ canvasId, request: { type: 'string' }, model }, ['request']) },
  { name: 'arrange', method: 'arrange', description: 'Auto-arrange the canvas into a tidy left-to-right tree.', inputSchema: object({ canvasId }) },
  { name: 'export_canvas', method: 'export_canvas', description: 'Export a canvas as md (Markdown outline), png, svg, html or wdf (the portable Wendaflow file). With path the file is written there; otherwise text is returned inline and png as an image.', inputSchema: object({ canvasId, format: { type: 'string', enum: ['md', 'png', 'svg', 'html', 'wdf'] }, theme: { type: 'string', enum: ['light', 'dark'] }, path: { type: 'string', description: 'Where to save the file (absolute, or relative to the agent\'s working directory).' } }, ['format']) },
];

const INLINE_LIMIT = 60_000;

async function exportResult(result, args, cwd) {
  const target = args.path ? path.resolve(cwd, args.path) : null;
  const bytes = result.base64 ? Buffer.from(result.base64, 'base64') : Buffer.from(result.text || '', 'utf8');
  if (target) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return [{ type: 'text', text: `Saved ${result.format.toUpperCase()} (${bytes.length} bytes) to ${target}` }];
  }
  if (result.base64) return [{ type: 'image', data: result.base64, mimeType: result.mimeType }, { type: 'text', text: `${result.fileName} · ${result.width}×${result.height}. Pass path to save it as a file.` }];
  if (result.text.length > INLINE_LIMIT) return [{ type: 'text', text: `${result.text.slice(0, INLINE_LIMIT)}\n\n[truncated: ${result.text.length} characters; pass path to save the whole file]` }];
  return [{ type: 'text', text: result.text }];
}

export function createMcpHandler({ client, cwd = process.cwd() }) {
  const byName = new Map(TOOLS.map(tool => [tool.name, tool]));
  async function callTool(name, args = {}) {
    const tool = byName.get(name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    try {
      const { path: _path, ...payload } = args || {};
      const result = await client.call(tool.method, tool.name === 'export_canvas' ? payload : args || {});
      if (tool.name === 'export_canvas') return { content: await exportResult(result, args || {}, cwd) };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    } catch (error) {
      return { content: [{ type: 'text', text: String(error?.message || error) }], isError: true };
    }
  }
  return async function handle(message) {
    const { id, method, params = {} } = message || {};
    const isRequest = id !== undefined && id !== null;
    const ok = (result) => (isRequest ? { jsonrpc: '2.0', id, result } : null);
    if (method === 'initialize') {
      const protocolVersion = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: TOOLS.map(({ method: _m, ...tool }) => tool) });
    if (method === 'tools/call') return ok(await callTool(params.name, params.arguments));
    if (!isRequest) return null; // notifications (initialized, cancelled…) need no answer
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  };
}

export function runStdio({ handle, input = process.stdin, output = process.stdout }) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  const write = (value) => { if (value) output.write(`${JSON.stringify(value)}\n`); };
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    const batch = Array.isArray(message) ? message : [message];
    for (const item of batch) {
      Promise.resolve(handle(item)).then(write, (error) => write({ jsonrpc: '2.0', id: item?.id ?? null, error: { code: -32603, message: String(error?.message || error) } }));
    }
  });
  return lines;
}
