// Everything an external agent can do to Wendaflow, as plain async functions.
// The HTTP routes, the MCP server and the CLI are thin wrappers around these.
import { randomUUID } from 'node:crypto';
import { contextMessages } from '../modelGateway.js';
import { diagramPrompt, parseDiagram, applyDiagram } from '../canvas/ai-diagram.mjs';
import { addExtraParent, detachParent } from '../canvas/parents.mjs';
import { toMarkdown, toSVG, toHTML } from '../canvas/export.mjs';
import { branchPosition, checkParents, childMap, layoutOps, makeIdea, makeQuestion, removalOps, rootPosition, sanitizePatch, summarizeCanvas, summarizeNode, CARD_W } from './ops.mjs';
import { complete, publicModel, resolveModel } from './ai.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, name, limit = 200_000) => { if (typeof value !== 'string' || !value.trim()) throw fail(`${name} 不能为空`); return value.slice(0, limit); };

export function createAgentService({ hub, listCanvases, env = process.env, streamers, renderPng, idFactory = () => randomUUID().slice(0, 12), streamInterval = 200 }) {
  const generations = new Map();

  function canvasIdOf(input = {}) {
    const id = input.canvasId || hub.status().activeCanvasId;
    if (!id) throw fail('未指定 canvasId，且浏览器里没有打开的画布。先调用 list_canvases 或 create_canvas。');
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw fail('画布 ID 无效');
    return id;
  }
  const nodeOf = (payload, id) => { const node = payload.nodes.find(n => n.id === id); if (!node) throw fail(`节点不存在：${id}`, 404); return node; };
  const parentsFrom = (input) => [...new Set([...(input.parentId ? [input.parentId] : []), ...(Array.isArray(input.parentIds) ? input.parentIds : [])].filter(Boolean).map(String))];

  async function status() {
    const s = hub.status();
    const { profiles, defaultModel } = hub.browserModels();
    return { ok: true, service: 'wendaflow-agent-api', browsers: s.browsers, activeCanvasId: s.activeCanvasId, activeCanvasName: s.activeCanvasName, models: profiles.map(publicModel), defaultModel };
  }

  async function models() {
    const shared = hub.browserModels();
    let fallback = null;
    try { fallback = publicModel(resolveModel(undefined, shared, env)); } catch {}
    return { models: shared.profiles.map(publicModel), defaultModel: fallback, note: shared.profiles.length ? undefined : '浏览器未共享模型连接；将使用 WENDAFLOW_AGENT_MODEL 或本机 Ollama。' };
  }

  async function createCanvas({ name, open = true } = {}) {
    const id = `canvas-${randomUUID()}`, now = new Date().toISOString();
    const canvas = { id, name: String(name || 'Agent canvas').replace(/[\r\n]/g, ' ').slice(0, 80), createdAt: now, updatedAt: now, createdBy: 'agent' };
    await hub.create({ format: 'branchspace-wdf', version: 1, canvas, nodes: [], selectedId: null, collapsedIds: [], viewport: { x: 20, y: 20, zoom: 0.9 } });
    const opened = open ? !!(await hub.command('open', { canvasId: id }, { timeout: 4000 }))?.ok : false;
    return { canvasId: id, name: canvas.name, openedInBrowser: opened };
  }

  async function openCanvas(input = {}) {
    const id = canvasIdOf(input);
    await hub.read(id);
    const answer = await hub.command('open', { canvasId: id }, { timeout: 4000 });
    return { canvasId: id, openedInBrowser: !!answer?.ok, ...(answer ? {} : { note: '没有已连接的浏览器；画布已保存在本地存档里。' }) };
  }

  async function getCanvas(input = {}) {
    const id = canvasIdOf(input);
    return summarizeCanvas(await hub.read(id), { full: !!input.full });
  }

  async function getNode(input = {}) {
    const id = canvasIdOf(input);
    const payload = await hub.read(id);
    const node = nodeOf(payload, text(input.nodeId, 'nodeId'));
    return summarizeNode(node, { full: true, children: childMap(payload.nodes).get(node.id) || [] });
  }

  // Each item: {ref?, title, content?, parentId?, parentIds?, x?, y?}. Parents may
  // name existing cards or the `ref` of an earlier item in the same call.
  async function addNodes(input = {}) {
    const id = canvasIdOf(input);
    const items = Array.isArray(input.nodes) ? input.nodes : [input];
    if (!items.length || items.length > 100) throw fail('一次可添加 1–100 个节点');
    return hub.mutate(id, (payload) => {
      let nodes = payload.nodes;
      const refs = new Map(), created = [], ops = [];
      for (const item of items) {
        const nodeId = `agent-${idFactory()}`;
        const title = typeof item.title === 'string' ? item.title : '';
        const content = typeof item.content === 'string' ? item.content : '';
        if (!title.trim() && !content.trim()) throw fail('节点需要 title 或 content');
        const parentIds = checkParents(nodes, nodeId, parentsFrom(item).map(p => refs.get(p) || p));
        const parent = parentIds.length ? nodes.find(n => n.id === parentIds[0]) : null;
        const auto = parent ? branchPosition(nodes, parent) : rootPosition(nodes);
        const position = { x: Number.isFinite(item.x) ? item.x : auto.x, y: Number.isFinite(item.y) ? item.y : auto.y };
        const node = makeIdea({ id: nodeId, title: title || content, content: title ? content : '', parentIds, position });
        if (Array.isArray(item.tags)) node.tags = item.tags.filter(t => typeof t === 'string');
        nodes = [...nodes, node];
        ops.push({ op: 'upsert', node });
        if (item.ref) refs.set(String(item.ref), nodeId);
        created.push({ id: nodeId, ...(item.ref ? { ref: String(item.ref) } : {}), title: node.title, parentId: node.parentId, ...(node.extraParentIds ? { extraParentIds: node.extraParentIds } : {}) });
      }
      return { ops, result: created };
    }).then(({ result, revision }) => ({ canvasId: id, revision, nodes: result }));
  }

  async function updateNode(input = {}) {
    const id = canvasIdOf(input), nodeId = text(input.nodeId, 'nodeId');
    const patch = sanitizePatch(input);
    if (!Object.keys(patch).length) throw fail('没有可修改的字段（title、content、prompt、x、y、tags、parentId、extraParentIds）');
    return hub.mutate(id, (payload) => {
      const node = nodeOf(payload, nodeId);
      if (node.status === 'thinking' || node.status === 'streaming' || node.status === 'queued') throw fail('该节点正在生成回答，请稍后再改');
      const parentId = 'parentId' in patch ? patch.parentId : node.parentId;
      const extras = 'extraParentIds' in patch ? patch.extraParentIds : (node.extraParentIds || []);
      if ('parentId' in patch || 'extraParentIds' in patch) checkParents(payload.nodes, nodeId, [parentId, ...extras]);
      if ('extraParentIds' in patch) patch.extraParentIds = extras.filter(p => p && p !== parentId);
      const next = { id: nodeId, ...patch };
      return { ops: [{ op: 'upsert', node: next }], result: summarizeNode({ ...node, ...next }) };
    }).then(({ result, revision }) => ({ canvasId: id, revision, node: result }));
  }

  // Multi-parent merge: add (or remove) a parent line between two existing cards.
  async function connectNodes(input = {}) {
    const id = canvasIdOf(input), parentId = text(input.parentId, 'parentId'), childId = text(input.childId, 'childId');
    return hub.mutate(id, (payload) => {
      nodeOf(payload, parentId); const child = nodeOf(payload, childId);
      let next;
      if (input.remove) next = detachParent(child, parentId);
      else {
        checkParents(payload.nodes, childId, [parentId]);
        next = addExtraParent(payload.nodes, parentId, childId).find(n => n.id === childId);
      }
      if (next === child) return { ops: [], result: summarizeNode(child) };
      return { ops: [{ op: 'upsert', node: { id: childId, parentId: next.parentId || null, extraParentIds: next.extraParentIds || [] } }], result: summarizeNode(next) };
    }).then(({ result, revision }) => ({ canvasId: id, revision, node: result }));
  }

  async function deleteNodes(input = {}) {
    const id = canvasIdOf(input);
    const ids = (Array.isArray(input.nodeIds) ? input.nodeIds : [input.nodeId]).filter(Boolean).map(String);
    if (!ids.length) throw fail('nodeIds 不能为空');
    return hub.mutate(id, (payload) => {
      for (const nodeId of ids) { generations.get(nodeId)?.controller.abort(); nodeOf(payload, nodeId); }
      const { ops, removed } = removalOps(payload.nodes, ids, { cascade: !!input.cascade });
      return { ops, result: removed };
    }).then(({ result, revision }) => ({ canvasId: id, revision, removed: result }));
  }

  async function renameCanvas(input = {}) {
    const id = canvasIdOf(input), name = text(input.name, 'name', 80).replace(/[\r\n]/g, ' ');
    return hub.mutate(id, () => ({ ops: [{ op: 'meta', canvas: { name } }], result: { name } })).then(({ revision }) => ({ canvasId: id, revision, name }));
  }

  // --- AI ---------------------------------------------------------------------

  function finalize(canvasId, nodeId, patch) {
    return hub.mutate(canvasId, (payload) => payload.nodes.some(n => n.id === nodeId) ? { ops: [{ op: 'upsert', node: { id: nodeId, ...patch } }] } : { ops: [] });
  }

  // Streams one answer into a card: live previews while it writes, one saved change at the end.
  function runAnswer(canvasId, nodeId, profile, messages) {
    const controller = new AbortController();
    const startedAt = Date.now();
    let latest = '', timer = null, sent = '';
    const push = () => { timer = null; if (latest === sent) return; sent = latest; hub.preview(canvasId, [{ op: 'upsert', node: { id: nodeId, content: latest, status: 'streaming', generationPhase: 'Streaming response…' } }]); };
    const promise = (async () => {
      try {
        hub.preview(canvasId, [{ op: 'upsert', node: { id: nodeId, status: 'thinking', generationPhase: 'Thinking…' } }]);
        const answer = await complete(profile, messages, { signal: controller.signal, streamers, onToken: (partial) => { latest = partial; if (!timer) timer = setTimeout(push, streamInterval); } });
        clearTimeout(timer);
        const content = String(answer || latest || '').trim();
        await finalize(canvasId, nodeId, { content, status: 'done', generationPhase: null, error: null, model: profile.model,
          requestRecord: { id: `request-${startedAt}`, status: 'done', startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, model: profile.model, provider: profile.name, via: 'agent', outputChars: content.length } });
        return { status: 'done', content };
      } catch (error) {
        clearTimeout(timer);
        const stopped = error?.name === 'AbortError';
        const message = stopped ? 'Generation stopped.' : String(error?.message || error);
        await finalize(canvasId, nodeId, { status: stopped ? 'stopped' : 'failed', generationPhase: null, error: stopped ? null : message, content: latest || message }).catch(() => {});
        return { status: stopped ? 'stopped' : 'failed', error: message, content: latest };
      } finally { generations.delete(nodeId); }
    })();
    generations.set(nodeId, { controller, promise, canvasId });
    return promise;
  }

  const withTimeout = (promise, ms) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); promise.then((v) => { clearTimeout(t); resolve(v); }); });

  // Branch a question off one card (or several: the first is the primary parent,
  // the rest merge their context in). `models` asks several models side by side.
  async function ask(input = {}) {
    const id = canvasIdOf(input), prompt = text(input.prompt, 'prompt');
    const requested = Array.isArray(input.models) && input.models.length ? input.models.slice(0, 6) : [input.model];
    const profiles = requested.map(m => resolveModel(m, hub.browserModels(), env));
    let context = null;
    const { result: created, revision } = await hub.mutate(id, (payload) => {
      let nodes = payload.nodes;
      const nodeIdBase = `agent-${idFactory()}`;
      const parentIds = checkParents(nodes, nodeIdBase, parentsFrom(input));
      // A blank stand-in carries the parent lines so context follows every parent.
      const probe = { id: `${nodeIdBase}-probe`, type: 'thought', title: '', content: '', parentId: parentIds[0] || null, ...(parentIds.length > 1 ? { extraParentIds: parentIds.slice(1) } : {}), x: 0, y: 0 };
      context = parentIds.length ? contextMessages([...nodes, probe], probe.id, prompt) : contextMessages(nodes, null, prompt);
      const parent = parentIds.length ? nodes.find(n => n.id === parentIds[0]) : null;
      const ops = [], out = [];
      profiles.forEach((profile, index) => {
        const nodeId = profiles.length > 1 ? `${nodeIdBase}-${index}` : nodeIdBase;
        const position = parent ? branchPosition(nodes, parent) : (index ? { x: out[0].x + (CARD_W + 76) * index, y: out[0].y } : rootPosition(nodes));
        const node = makeQuestion({ id: nodeId, prompt, parentIds, position, model: profile.model, modelValue: profile.value || null });
        nodes = [...nodes, node]; ops.push({ op: 'upsert', node }); out.push(node);
      });
      return { ops, result: out };
    });
    const runs = created.map((node, index) => runAnswer(id, node.id, profiles[index], context));
    const base = { canvasId: id, revision, nodeIds: created.map(n => n.id), models: profiles.map(publicModel) };
    if (input.wait === false) return { ...base, status: 'running' };
    const results = await withTimeout(Promise.all(runs), Math.min(Number(input.timeoutMs) || 180_000, 600_000));
    if (!results) return { ...base, status: 'running', note: '回答仍在生成，可稍后用 get_node 查看。' };
    return { ...base, answers: results.map((r, i) => ({ nodeId: created[i].id, model: profiles[i].model, ...r })) };
  }

  async function waitForNode(input = {}) {
    const job = generations.get(text(input.nodeId, 'nodeId'));
    if (job) await withTimeout(job.promise, Math.min(Number(input.timeoutMs) || 120_000, 600_000));
    return getNode(input);
  }

  async function stopNode(input = {}) {
    const job = generations.get(text(input.nodeId, 'nodeId'));
    job?.controller.abort();
    if (job) await job.promise;
    return { stopped: !!job, nodeId: input.nodeId };
  }

  // AI drawing: the model returns a JSON graph that grows on the canvas while it streams.
  async function draw(input = {}) {
    const id = canvasIdOf(input), request = text(input.request, 'request', 8000);
    const profile = resolveModel(input.model, hub.browserModels(), env);
    const base = (await hub.read(id)).nodes;
    const baseIds = base.map(n => n.id), byId = new Map(base.map(n => [n.id, n]));
    const maxX = base.length ? Math.max(...base.map(n => n.x + (n.manualWidth || CARD_W))) : 0;
    const origin = base.length ? { x: maxX + 160, y: Math.min(...base.map(n => n.y)) } : { x: 120, y: 110 };
    const stamp = Date.now();
    const diff = (result) => result.nodes.filter(n => !byId.has(n.id) || byId.get(n.id) !== n).map(n => byId.has(n.id) ? { op: 'upsert', node: { id: n.id, relations: n.relations } } : { op: 'upsert', node: n });
    let shown = 0, timer = null, latest = '', previewed = new Set();
    const show = () => {
      timer = null;
      const partial = parseDiagram(latest, baseIds, { partial: true });
      if (!partial || partial.nodes.length === shown) return;
      shown = partial.nodes.length;
      const ops = diff(applyDiagram(base, partial, { origin, stamp, author: 'AI' }));
      ops.forEach(op => previewed.add(op.node.id));
      hub.preview(id, ops);
    };
    const messages = contextMessages(base, null, diagramPrompt(request, base), [], []);
    const answer = await complete(profile, messages, { streamers, onToken: (partial) => { latest = partial; if (!timer) timer = setTimeout(show, streamInterval); } });
    clearTimeout(timer);
    const diagram = parseDiagram(answer || latest, baseIds);
    const outcome = await hub.mutate(id, (payload) => {
      // Re-check against the current file: cards removed meanwhile drop their lines.
      const live = new Set(payload.nodes.map(n => n.id));
      const known = baseIds.filter(n => live.has(n));
      const result = applyDiagram(base.filter(n => live.has(n.id)), { nodes: diagram.nodes, edges: diagram.edges.filter(e => [e.from, e.to].every(x => diagram.nodes.some(n => n.id === x) || known.includes(x))) }, { origin, stamp, author: 'AI' });
      const ops = diff(result);
      // A tab may have autosaved preview cards that the final drawing no longer has.
      const finalIds = new Set(result.createdIds);
      const stale = [...previewed].filter(nid => nid.startsWith(`draw-${stamp}-`) && !finalIds.has(nid) && live.has(nid));
      if (stale.length) ops.push({ op: 'delete', ids: stale });
      return { ops, result: { createdIds: result.createdIds, edgeCount: result.edgeCount } };
    });
    // Previews of cards that never made it into the final drawing are cleared from open tabs.
    const finalIds = new Set(outcome.result.createdIds);
    const orphans = [...previewed].filter(nid => nid.startsWith(`draw-${stamp}-`) && !finalIds.has(nid));
    if (orphans.length) hub.preview(id, [{ op: 'delete', ids: orphans }]);
    return { canvasId: id, revision: outcome.revision, model: publicModel(profile), createdIds: outcome.result.createdIds, edgeCount: outcome.result.edgeCount, nodes: diagram.nodes.map((n, i) => ({ id: `draw-${stamp}-${i}`, title: n.title })) };
  }

  // Auto arrange: an open tab lays out with real card sizes; otherwise the server estimates.
  async function arrange(input = {}) {
    const id = canvasIdOf(input);
    const answer = await hub.command('arrange', {}, { canvasId: id, timeout: 4000 });
    if (answer?.ok) { const payload = await hub.read(id); return { canvasId: id, arrangedBy: 'browser', revision: payload.agentRevision || 0 }; }
    const { revision, result } = await hub.mutate(id, (payload) => { const ops = layoutOps(payload.nodes); return { ops, result: ops.length }; });
    return { canvasId: id, arrangedBy: 'server', moved: result, revision };
  }

  async function exportCanvas(input = {}) {
    const id = canvasIdOf(input), format = String(input.format || 'md').toLowerCase();
    const payload = await hub.read(id);
    const name = String(payload.canvas?.name || 'wendaflow').replace(/[\\/:*?"<>|\r\n]/g, '_');
    const theme = input.theme === 'dark' ? 'dark' : 'light';
    const nodes = payload.nodes;
    if (format === 'md' || format === 'markdown') return { canvasId: id, format: 'md', mimeType: 'text/markdown', fileName: `${name}.md`, text: toMarkdown(nodes, { title: name }) };
    if (format === 'html') return { canvasId: id, format, mimeType: 'text/html', fileName: `${name}.html`, text: toHTML(nodes, { theme, title: name }) };
    if (format === 'svg') return { canvasId: id, format, mimeType: 'image/svg+xml', fileName: `${name}.svg`, text: toSVG(nodes, { theme, title: name }).svg };
    if (format === 'wdf') { const { agentRevision, ...portable } = payload; return { canvasId: id, format, mimeType: 'application/json', fileName: `${name}.wdf`, text: JSON.stringify({ ...portable, format: 'branchspace-wdf', version: 1 }, null, 2) }; }
    if (format === 'png') {
      if (!nodes.length) throw fail('画布是空的，没有可导出的内容');
      if (!renderPng) throw fail('当前环境无法渲染 PNG，请改用 svg');
      const { svg, width, height } = toSVG(nodes, { theme, title: name });
      const scale = Math.max(0.25, Math.min(2, 8000 / Math.max(width, height)));
      const png = await renderPng(svg, Math.round(width * scale), Math.round(height * scale));
      return { canvasId: id, format, mimeType: 'image/png', fileName: `${name}.png`, width: Math.round(width * scale), height: Math.round(height * scale), base64: Buffer.from(png).toString('base64') };
    }
    throw fail('format 只支持 md、html、svg、png、wdf');
  }

  async function list() { return { canvases: await listCanvases(), active: hub.status().activeCanvasId }; }

  return { status, models, listCanvases: list, createCanvas, openCanvas, getCanvas, getNode, addNodes, updateNode, connectNodes, deleteNodes, renameCanvas, ask, waitForNode, stopNode, draw, arrange, exportCanvas };
}
