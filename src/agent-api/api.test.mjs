import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { canvasStorage } from '../../canvas-storage.mjs';
import { createAgentApi } from './index.mjs';
import { applyNodeOps } from './ops.mjs';
import { createClient } from './client.mjs';
import { createMcpHandler, TOOLS } from './mcp.mjs';

// A stand-in model: echoes the prompt it was sent, a few tokens at a time.
function fakeStreamers(log = []) {
  const run = async ({ messages, onToken, signal }) => {
    const prompt = messages.at(-1).content;
    log.push(prompt);
    if (prompt.includes('画布绘图助手')) {
      const text = '{"nodes":[{"id":"n1","title":"Start","parents":[]},{"id":"n2","title":"Finish","parents":["n1"]}]}';
      for (let i = 20; i < text.length; i += 20) { onToken(text.slice(0, i)); await new Promise(r => setTimeout(r, 2)); }
      return text;
    }
    let out = '';
    for (const word of ['Answer', ' to', ' the', ' question']) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      out += word; onToken(out); await new Promise(r => setTimeout(r, prompt.includes('stop me') ? 300 : 5));
    }
    return out;
  };
  return { streamCloud: run, streamOllama: run };
}

async function startApp(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wendaflow-agent-api-'));
  const storage = canvasStorage(root);
  const prompts = [];
  const api = createAgentApi({ canvasDir: path.join(root, 'data', 'canvases'), save: (p) => storage.save(p), env: { WENDAFLOW_AGENT_FILE: path.join(root, 'agent.json') }, streamers: fakeStreamers(prompts), renderPng: async () => Buffer.from('PNG'), commandTimeout: 400, streamInterval: 1, ...options });
  const server = http.createServer(async (req, res) => {
    if (await api.handle(req, res)) return;
    if (req.method === 'POST' && req.url === '/canvases/save') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      try { const outcome = await api.hub.browserSave(JSON.parse(raw)); res.writeHead(200); res.end(JSON.stringify({ ok: true, ...outcome })); }
      catch (error) { res.writeHead(error.status || 400); res.end(JSON.stringify({ error: error.message, conflict: error.status === 409 })); }
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  await api.publish(url);
  const client = createClient({ env: { WENDAFLOW_AGENT_FILE: path.join(root, 'agent.json') } });
  t.after(async () => { await api.cleanup(); server.closeAllConnections?.(); await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }); });
  return { root, url, api, client, prompts, file: (id) => path.join(root, 'data', 'canvases', `${id}.wdf`) };
}

// A minimal browser tab: keeps its own copy of the open canvas from the event stream.
async function fakeTab(app, { activeCanvasId = null, origin = 'http://localhost:5173', onCommand } = {}) {
  const clientId = `tab-${Math.random().toString(36).slice(2)}`;
  const controller = new AbortController();
  const tab = { clientId, nodes: [], events: [], rev: 0, activeCanvasId, close: () => controller.abort() };
  const response = await fetch(`${app.url}/agent-api/browser/events?client=${clientId}`, { headers: { Origin: origin }, signal: controller.signal });
  assert.equal(response.status, 200);
  const post = (route, body) => fetch(`${app.url}/agent-api/browser/${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  tab.post = post;
  const ready = new Promise((resolve) => { tab.ready = resolve; });
  (async () => {
    const decoder = new TextDecoder(); let buffer = '';
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
          const type = block.match(/^event: (.*)$/m)?.[1]; const data = block.match(/^data: (.*)$/m)?.[1];
          if (!type) continue;
          const value = JSON.parse(data);
          tab.events.push({ type, ...value });
          if (type === 'hello') tab.ready();
          if (type === 'ops' && value.canvasId === tab.activeCanvasId) { tab.nodes = applyNodeOps(tab.nodes, value.ops); if (value.rev) tab.rev = value.rev; }
          if (type === 'command') { const result = await (onCommand?.(value, tab) ?? {}); if (result !== false) await post('ack', { id: value.id, result }); }
        }
      }
    } catch {}
  })();
  await ready;
  await post('presence', { clientId, activeCanvasId, activeCanvasName: 'Tab canvas', profiles: [{ value: 'cloud:fast', kind: 'cloud', name: 'Fast', model: 'fast-1', format: 'openai-compatible', endpoint: 'https://api.example.com/v1', apiKey: 'k' }, { value: 'local:slow', kind: 'local', name: 'Slow', model: 'slow-1', endpoint: 'http://127.0.0.1:11434' }], defaultModel: 'cloud:fast' });
  return tab;
}

const until = async (check, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return true; await new Promise(r => setTimeout(r, 10)); } return false; };

test('agents need the local token and can never be reached from a web page', async (t) => {
  const app = await startApp(t);
  assert.equal((await fetch(`${app.url}/agent-api/v1/status`, { method: 'POST' })).status, 401);
  const { token } = JSON.parse(await readFile(path.join(app.root, 'agent.json'), 'utf8'));
  assert.equal((await stat(path.join(app.root, 'agent.json'))).mode & 0o077, 0, 'discovery file is private');
  assert.equal((await fetch(`${app.url}/agent-api/v1/status`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${app.url}/agent-api/v1/status`, { method: 'POST', headers: { Authorization: `Bearer ${token}x` } })).status, 401);
  const ok = await fetch(`${app.url}/agent-api/v1/status`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await ok.json()).service, 'wendaflow-agent-api');
  assert.equal((await fetch(`${app.url}/agent-api/browser/events`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${app.url}/agent-api/v1/nope`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 404);
  await app.api.cleanup();
  await assert.rejects(readFile(path.join(app.root, 'agent.json')), 'discovery file removed on shutdown');
});

test('an agent builds a canvas the open browser tab sees live, branches questions and merges parents', async (t) => {
  const app = await startApp(t);
  const tab = await fakeTab(app, { onCommand: (command, self) => { if (command.type === 'open') { self.activeCanvasId = command.canvasId; return {}; } return {}; } });
  const created = await app.client.call('create_canvas', { name: 'Pitch' });
  assert.equal(created.openedInBrowser, true);
  await tab.post('presence', { clientId: tab.clientId, activeCanvasId: created.canvasId });
  const status = await app.client.call('status');
  assert.equal(status.activeCanvasId, created.canvasId);
  assert.deepEqual(status.models.map(m => m.name), ['Fast', 'Slow']);
  assert.equal(JSON.stringify(status).includes('"apiKey"'), false, 'keys are never returned to agents');

  // canvasId omitted: the canvas open in the browser is used.
  const added = await app.client.call('add_nodes', { nodes: [{ ref: 'p', title: '用户痛点' }, { ref: 'q', title: '竞品', parentId: 'p' }, { title: '机会', parentIds: ['p', 'q'] }] });
  assert.equal(added.nodes.length, 3);
  const [p, q, merge] = added.nodes;
  assert.deepEqual(merge.extraParentIds, [q.id]);
  assert.ok(await until(() => tab.nodes.length === 3));
  assert.equal(tab.rev, added.revision);

  const asked = await app.client.call('ask', { parentIds: [merge.id], prompt: '怎么切入？' });
  assert.equal(asked.answers[0].status, 'done');
  assert.equal(asked.answers[0].content, 'Answer to the question');
  assert.equal(asked.models[0].name, 'Fast', 'uses the model selected in the browser');
  assert.match(app.prompts.at(-1), /用户痛点[\s\S]*竞品[\s\S]*机会[\s\S]*=== 当前问题 ===\n怎么切入？/, 'context walks every parent branch');
  assert.ok(tab.events.some(e => e.type === 'ops' && e.transient && e.ops[0].node.status === 'streaming'), 'the tab saw the answer stream in');
  assert.ok(await until(() => tab.nodes.find(n => n.id === asked.nodeIds[0])?.status === 'done'));

  const race = await app.client.call('ask', { parentId: p.id, prompt: 'Compare', models: ['Fast', 'slow-1'] });
  assert.deepEqual(race.answers.map(a => a.model), ['fast-1', 'slow-1']);
  const canvas = await app.client.call('get_canvas', {});
  assert.equal(canvas.nodeCount, 6);
  assert.match(canvas.outline, /\(\+parents: /);
  const file = JSON.parse(await readFile(app.file(created.canvasId), 'utf8'));
  assert.equal(file.agentRevision, canvas.revision);
  assert.deepEqual(tab.nodes.map(n => n.id).sort(), file.nodes.map(n => n.id).sort(), 'browser and file agree');

  await assert.rejects(app.client.call('connect_nodes', { parentId: merge.id, childId: p.id }), /环/);
  const linked = await app.client.call('connect_nodes', { parentId: q.id, childId: race.nodeIds[0] });
  assert.deepEqual(linked.node.extraParentIds, [q.id]);
  const pending = await app.client.call('ask', { parentId: p.id, prompt: 'stop me', wait: false });
  const stop = await tab.post('stop', { nodeId: pending.nodeIds[0] });
  assert.equal(stop.stopped, true);
  assert.equal((await app.client.call('get_node', { nodeId: pending.nodeIds[0] })).status, 'stopped');
  const removed = await app.client.call('delete_nodes', { nodeIds: [q.id] });
  assert.deepEqual(removed.removed, [q.id]);
  assert.ok(await until(() => !tab.nodes.some(n => n.id === q.id) && !tab.nodes.some(n => n.extraParentIds?.includes(q.id))));
  tab.close();
});

test('browser saves that missed agent edits get them merged instead of overwriting them', async (t) => {
  const app = await startApp(t);
  const { canvasId } = await app.client.call('create_canvas', { name: 'Merge', open: false });
  const first = await app.client.call('add_nodes', { canvasId, nodes: [{ title: 'agent idea' }] });
  // The tab has seen revision `first.revision` and adds its own card...
  const tabState = { canvas: { id: canvasId, name: 'Merge' }, nodes: [{ ...first.nodes[0], type: 'thought', x: 0, y: 0 }, { id: 'user', type: 'thought', title: 'user idea', x: 0, y: 200 }] };
  // ...while the agent adds another one.
  const second = await app.client.call('add_nodes', { canvasId, nodes: [{ title: 'second agent idea' }] });
  const save = await fetch(`${app.url}/canvases/save`, { method: 'POST', body: JSON.stringify({ ...tabState, agentRev: first.revision }) });
  assert.equal(save.status, 200);
  const file = JSON.parse(await readFile(app.file(canvasId), 'utf8'));
  assert.deepEqual(file.nodes.map(n => n.title).sort(), ['agent idea', 'second agent idea', 'user idea']);
  assert.equal(file.agentRevision, second.revision);
  // A tab without the live link still saves normally and keeps the revision.
  await fetch(`${app.url}/canvases/save`, { method: 'POST', body: JSON.stringify(tabState) });
  assert.equal(JSON.parse(await readFile(app.file(canvasId), 'utf8')).agentRevision, second.revision);
  // After a restart the log is gone: a stale save is refused rather than silently dropping agent edits.
  const restarted = createAgentApi({ canvasDir: path.join(app.root, 'data', 'canvases'), save: (p) => canvasStorage(app.root).save(p), env: { WENDAFLOW_AGENT_FILE: path.join(app.root, 'other.json') } });
  await assert.rejects(restarted.hub.browserSave({ ...tabState, agentRev: first.revision }), /重新载入/);
  const caughtUp = await restarted.hub.browserSave({ ...tabState, agentRev: second.revision });
  assert.equal(caughtUp.revision, second.revision);
});

test('reads flush the open tab first, arrange prefers the tab, and replay fills gaps after reconnect', async (t) => {
  const app = await startApp(t);
  const { canvasId } = await app.client.call('create_canvas', { name: 'Flush', open: false });
  const seen = [];
  const tab = await fakeTab(app, { activeCanvasId: canvasId, onCommand: async (command) => {
    seen.push(command.type);
    if (command.type === 'flush') {
      await fetch(`${app.url}/canvases/save`, { method: 'POST', body: JSON.stringify({ canvas: { id: canvasId, name: 'Flush' }, nodes: [{ id: 'typed', type: 'thought', title: 'typed just now', x: 5, y: 5 }], agentRev: 1 }) });
    }
    return {};
  } });
  const canvas = await app.client.call('get_canvas', { canvasId });
  assert.deepEqual(canvas.nodes.map(n => n.title), ['typed just now']);
  assert.equal((await app.client.call('arrange', { canvasId })).arrangedBy, 'browser');
  assert.deepEqual(seen, ['flush', 'arrange', 'flush']);
  tab.close();
  await until(() => app.api.hub.status().browsers === 0);
  const offline = await app.client.call('arrange', { canvasId });
  assert.equal(offline.arrangedBy, 'server');
  const added = await app.client.call('add_nodes', { canvasId, nodes: [{ title: 'while away' }] });
  const gap = await fetch(`${app.url}/agent-api/browser/ops?canvasId=${canvasId}&since=1`, { headers: { Origin: 'null' } }).then(r => r.json());
  assert.equal(gap.complete, true);
  assert.equal(gap.entries.at(-1).rev, added.revision);
  const presence = await fetch(`${app.url}/agent-api/browser/presence`, { method: 'POST', headers: { Origin: 'null' }, body: JSON.stringify({ clientId: 'gone', knownCanvasIds: [canvasId, '../bad'] }) }).then(r => r.json());
  assert.deepEqual(presence.revisions, { [canvasId]: added.revision });
});

test('AI drawing grows live and lands as one saved change; exports cover every format', async (t) => {
  const app = await startApp(t);
  const { canvasId } = await app.client.call('create_canvas', { name: 'Draw', open: false });
  await app.client.call('add_nodes', { canvasId, nodes: [{ title: 'existing' }] });
  const drawn = await app.client.call('draw', { canvasId, request: 'a two step flow', model: 'ollama:qwen' });
  assert.equal(drawn.createdIds.length, 2);
  assert.equal(drawn.model.model, 'qwen');
  const canvas = await app.client.call('get_canvas', { canvasId });
  const finish = canvas.nodes.find(n => n.title === 'Finish');
  assert.equal(finish.parentId, canvas.nodes.find(n => n.title === 'Start').id);
  const md = await app.client.call('export_canvas', { canvasId, format: 'md' });
  assert.match(md.text, /Finish/);
  const wdf = JSON.parse((await app.client.call('export_canvas', { canvasId, format: 'wdf' })).text);
  assert.equal(wdf.format, 'branchspace-wdf'); assert.equal(wdf.agentRevision, undefined);
  assert.match((await app.client.call('export_canvas', { canvasId, format: 'svg' })).text, /^<svg/);
  const png = await app.client.call('export_canvas', { canvasId, format: 'png' });
  assert.equal(Buffer.from(png.base64, 'base64').toString(), 'PNG');
  await assert.rejects(app.client.call('export_canvas', { canvasId, format: 'docx' }), /format/);
});

test('MCP: lists tools, runs them against the app and saves exports where the agent asks', async (t) => {
  const app = await startApp(t);
  const handle = createMcpHandler({ client: app.client, cwd: app.root });
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test' } } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.ok(init.result.capabilities.tools);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map(tool => tool.name), TOOLS.map(tool => tool.name));
  assert.ok(list.result.tools.every(tool => tool.inputSchema.type === 'object' && !('method' in tool)));
  const call = (name, args) => handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }).then(r => r.result);
  const created = await call('create_canvas', { name: 'MCP', open: false });
  const { canvasId } = created.structuredContent;
  const added = await call('add_nodes', { canvasId, nodes: [{ title: 'root' }] });
  const asked = await call('ask', { canvasId, parentId: added.structuredContent.nodes[0].id, prompt: 'go', wait: false });
  assert.equal(asked.structuredContent.status, 'running');
  const done = await call('wait_for_node', { canvasId, nodeId: asked.structuredContent.nodeIds[0] });
  assert.equal(done.structuredContent.status, 'done');
  const saved = await call('export_canvas', { canvasId, format: 'md', path: 'out/canvas.md' });
  assert.match(saved.content[0].text, /Saved MD/);
  assert.match(await readFile(path.join(app.root, 'out', 'canvas.md'), 'utf8'), /root/);
  const image = await call('export_canvas', { canvasId, format: 'png' });
  assert.equal(image.content[0].type, 'image');
  const failed = await call('get_node', { canvasId, nodeId: 'missing' });
  assert.equal(failed.isError, true);
  assert.equal((await handle({ jsonrpc: '2.0', id: 9, method: 'resources/list' })).error.code, -32601);
});

test('the CLI client explains when Wendaflow is not running', async () => {
  const client = createClient({ env: { WENDAFLOW_AGENT_FILE: path.join(os.tmpdir(), `missing-${Date.now()}.json`) } });
  await assert.rejects(client.call('status'), /npm run app/);
});
