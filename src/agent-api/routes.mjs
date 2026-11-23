// HTTP surface of the agent API, mounted by server.mjs on 127.0.0.1 only.
//
//   /agent-api/v1/<method>   for agents: needs the local token, refuses any
//                            request a web page could make (it carries Origin)
//   /agent-api/browser/...   for the Wendaflow tab: live events, presence and
//                            command answers; loopback / desktop origins only
import { timingSafeEqual } from 'node:crypto';

export const METHODS = {
  status: 'status', models: 'models',
  list_canvases: 'listCanvases', create_canvas: 'createCanvas', open_canvas: 'openCanvas', rename_canvas: 'renameCanvas',
  get_canvas: 'getCanvas', get_node: 'getNode',
  add_node: 'addNodes', add_nodes: 'addNodes', update_node: 'updateNode', connect_nodes: 'connectNodes', delete_nodes: 'deleteNodes',
  ask: 'ask', wait_for_node: 'waitForNode', stop_node: 'stopNode', draw: 'draw', arrange: 'arrange', export_canvas: 'exportCanvas',
};

export function loopbackOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null' || origin.startsWith('file://')) return true;
  try { const url = new URL(origin); return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost'); } catch { return false; }
}

export function tokenMatches(expected, header) {
  const given = String(header || '').replace(/^Bearer\s+/i, '').trim();
  if (!expected || !given) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req, limit = 2_000_000) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Object.assign(new Error('请求体过大'), { status: 413 }); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('请求体必须是 JSON 对象'), { status: 400 });
  return value;
}

export function createAgentRoutes({ hub, service, token }) {
  const json = (res, status, body, headers = {}) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

  async function handleAgent(req, res, url) {
    // A browser always sends Origin on cross-site requests; agents never do.
    if (req.headers.origin) return json(res, 403, { error: 'Agent API 不接受网页请求' });
    if (!tokenMatches(token(), req.headers.authorization || req.headers['x-wendaflow-token'])) return json(res, 401, { error: '缺少或错误的 Wendaflow 本地令牌' });
    const name = url.pathname.slice('/agent-api/v1/'.length);
    const method = METHODS[name];
    if (!method) return json(res, 404, { error: `未知方法：${name}`, methods: Object.keys(METHODS) });
    if (req.method !== 'POST' && !(req.method === 'GET' && ['status', 'models', 'list_canvases'].includes(name))) return json(res, 405, { error: '请使用 POST' });
    try {
      const args = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
      json(res, 200, await service[method](args));
    } catch (error) {
      json(res, error.status || (error instanceof SyntaxError ? 400 : 500), { error: error.message || String(error) });
    }
  }

  async function handleBrowser(req, res, url) {
    const origin = req.headers.origin;
    if (!loopbackOrigin(origin)) return json(res, 403, { error: 'Origin not allowed' });
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const route = url.pathname.slice('/agent-api/browser/'.length);
    try {
      if (req.method === 'GET' && route === 'events') {
        const clientId = String(url.searchParams.get('client') || '').slice(0, 80) || undefined;
        hub.attach(req, res, { clientId, lastEventId: req.headers['last-event-id'] || url.searchParams.get('since'), headers: cors });
        return;
      }
      if (req.method === 'POST' && route === 'presence') {
        const body = await readBody(req);
        const ok = hub.presence(String(body.clientId || ''), body);
        // Revisions of the canvases this tab knows, so it can catch up on missed agent edits.
        const revisions = {};
        for (const id of (Array.isArray(body.knownCanvasIds) ? body.knownCanvasIds : []).slice(0, 500)) {
          if (typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)) { const rev = await hub.revisionOf(id); if (rev) revisions[id] = rev; }
        }
        return json(res, 200, { ok, revisions }, cors);
      }
      if (req.method === 'POST' && route === 'stop') { const body = await readBody(req, 10_000); return json(res, 200, await service.stopNode({ nodeId: String(body.nodeId || '') }), cors); }
      if (req.method === 'POST' && route === 'ack') { const body = await readBody(req, 200_000); return json(res, 200, { ok: hub.acknowledge(String(body.id || ''), body.result || {}) }, cors); }
      if (req.method === 'GET' && route === 'ops') {
        const id = url.searchParams.get('canvasId') || '';
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) return json(res, 400, { error: '画布 ID 无效' }, cors);
        await hub.revisionOf(id);
        return json(res, 200, hub.opsSince(id, Number(url.searchParams.get('since')) || 0), cors);
      }
      json(res, 404, { error: 'Not found' }, cors);
    } catch (error) { json(res, error.status || 400, { error: error.message }, cors); }
  }

  // Returns true when the request belonged to the agent API.
  return async function handle(req, res) {
    if (!req.url?.startsWith('/agent-api/')) return false;
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/agent-api/v1/')) await handleAgent(req, res, url);
    else if (url.pathname.startsWith('/agent-api/browser/')) await handleBrowser(req, res, url);
    else json(res, 404, { error: 'Not found' });
    return true;
  };
}
