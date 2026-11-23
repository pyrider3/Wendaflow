// The App functions that connect the canvas to the agent link, run in isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { applyNodeOps, canvasMeta } from './ops.mjs';
import { durableCanvasIndex } from '../canvas/library.mjs';
import { normalizeWdf } from '../canvas/document.mjs';

const src = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const app = parse(src, { sourceType: 'module', plugins: ['jsx'] }).program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'App');
function actual(name, ctx) {
  const f = app.body.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  vm.createContext(ctx); vm.runInContext(src.slice(f.start, f.end), ctx); return ctx[name];
}

function saveContext(extra = {}) {
  const requests = [];
  const ctx = {
    requests, activeCanvasId: 'a', activeCanvasIdRef: { current: 'a' }, activeCanvas: { id: 'a', name: 'A' }, canvases: [{ id: 'a', name: 'A' }],
    discardedCanvasIdsRef: { current: new Set() }, autosavePolicyRef: { current: { a: true } }, imeComposingRef: { current: false }, imePendingSaveRef: { current: false },
    editingNode: null, quickEditor: null, currentNodes: () => [{ id: 'n', x: 0, y: 0 }], targetViewportRef: { current: { x: 0, y: 0, zoom: 1 } },
    canvasSavesRef: { current: new Map() }, archiveTombstones: { current: new Set() }, selectedId: null, collapsedIds: new Set(),
    setSaveStatus: () => {}, writeCanvasState: async () => {}, setCacheWarning: () => {}, setStorageWarning: () => {}, setCanvasLibraryStatus: () => {}, setCanvases: () => {},
    refreshSavedCanvases: async () => {}, enableCanvasAutosave: () => {}, say: (zh) => zh, PUBLIC_WEB: false, LOCAL_PROXY_URL: 'http://proxy', CANVAS_INDEX_KEY: 'k', durableCanvasIndex,
    localStorage: { setItem: () => {} }, JSON, Promise, Set, Map, Date,
    fetch: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; },
    ...extra,
  };
  return ctx;
}

test('canvas saves report the agent revision the tab has applied, and still work without the agent link', async () => {
  const linked = saveContext({ agentBridge: { revisionOf: (id) => (id === 'a' ? 7 : 0) } });
  await actual('saveCanvas', linked)(true);
  assert.equal(linked.requests[0].url, 'http://proxy/canvases/save');
  assert.equal(linked.requests[0].body.agentRev, 7);
  const plain = saveContext();
  await actual('saveCanvas', plain)(true);
  assert.equal('agentRev' in plain.requests[0].body, false, 'no agentBridge in scope: nothing is added and nothing throws');
});

test('a save refused for missing agent edits asks the bridge to catch up', async () => {
  let reconciled = null, warning = '';
  const ctx = saveContext({
    agentBridge: { revisionOf: () => 1, reconcile: (id) => { reconciled = id; } },
    setStorageWarning: (value) => { warning = value; },
    fetch: async () => ({ ok: false, status: 409, json: async () => ({ error: 'stale', conflict: true }) }),
  });
  await actual('saveCanvas', ctx)(true);
  assert.equal(reconciled, 'a');
  assert.match(warning, /stale/);
});

function opsContext(extra = {}) {
  let live = [{ id: 'x', type: 'thought', title: 'X', x: 0, y: 0 }];
  const ctx = {
    get live() { return live; },
    activeCanvasIdRef: { current: 'a' }, canvasesRef: { current: [{ id: 'a' }, { id: 'b' }] }, autosavePolicyRef: { current: {} },
    enabled: [], enableCanvasAutosave: (id) => { ctx.enabled.push(id); ctx.autosavePolicyRef.current[id] = true; },
    setNodesBackground: (update) => { live = update(live); }, setCanvases: (update) => { ctx.catalog = update([{ id: 'a', name: 'old' }, { id: 'b', name: 'B' }]); },
    canvasWriteQueueRef: { current: new Map() }, canvasDraftsRef: { current: new Map([['b', { nodes: [{ id: 'y', x: 0, y: 0 }] }]]) },
    readCanvasState: async () => null, writeCanvasState: async () => {}, applyNodeOps, canvasMeta, console, Promise, Array, Date,
    ...extra,
  };
  return ctx;
}

test('agent edits go straight into the open canvas, and background canvases update their draft', async () => {
  const ctx = opsContext();
  const apply = actual('applyAgentOps', ctx);
  assert.equal(apply('a', [{ op: 'upsert', node: { id: 'new', type: 'thought', title: 'N', x: 1, y: 1 } }, { op: 'meta', canvas: { name: 'Renamed' } }]), true);
  assert.deepEqual(ctx.live.map(n => n.id), ['x', 'new']);
  assert.deepEqual(ctx.enabled, ['a'], 'a canvas an agent edits is kept on disk');
  assert.equal(ctx.catalog.find(c => c.id === 'a').name, 'Renamed');
  // Live previews (a streaming answer) only touch the open canvas.
  assert.equal(apply('b', [{ op: 'upsert', node: { id: 'y', content: 'partial' } }], { transient: true }), false);
  assert.equal(apply('b', [{ op: 'delete', ids: ['y'] }]), true);
  await ctx.canvasWriteQueueRef.current.get('b');
  assert.deepEqual(ctx.canvasDraftsRef.current.get('b').nodes, []);
  assert.equal(apply('unknown', [{ op: 'delete', ids: ['y'] }]), false, 'canvases this tab never opened are left to the file');
});

test('reloading from the file replaces the open canvas and its cached copy', async () => {
  let replaced = null, cached = null, note = '';
  const file = { format: 'branchspace-wdf', version: 1, canvas: { id: 'a' }, nodes: [{ id: 'f', type: 'thought', x: 0, y: 0 }], collapsedIds: [], agentRevision: 4 };
  const ctx = {
    LOCAL_PROXY_URL: 'http://proxy', normalizeWdf, activeCanvasIdRef: { current: 'a' }, canvasDraftsRef: { current: new Map() },
    fetch: async (url) => { assert.equal(url, 'http://proxy/canvases/open?id=a'); return { ok: true, json: async () => file }; },
    writeCanvasState: async (_id, state) => { cached = state; }, replaceNodes: (nodes) => { replaced = nodes; }, setCollapsedIds: () => {},
    notify: (text) => { note = text; }, tr: (zh) => zh, console, Set, encodeURIComponent,
  };
  assert.equal(await actual('reloadCanvasFromFile', ctx)('a'), true);
  assert.deepEqual(replaced.map(n => n.id), ['f']);
  assert.equal(cached.nodes.length, 1);
  assert.match(note, /Agent/);
  ctx.fetch = async () => ({ ok: false, json: async () => ({ error: 'gone' }) });
  assert.equal(await actual('reloadCanvasFromFile', ctx)('a'), false);
});

test('the Stop button also stops answers the local server is generating for an agent', () => {
  const stopped = [];
  const ctx = { generationRef: { current: new Map() }, agentBridge: { stop: (id) => stopped.push(id) } };
  actual('stopGeneration', ctx)('agent-1');
  assert.deepEqual(stopped, ['agent-1']);
  let aborted = false;
  ctx.generationRef.current.set('own', { abort: () => { aborted = true; } });
  actual('stopGeneration', ctx)('own');
  assert.equal(aborted, true); assert.deepEqual(stopped, ['agent-1']);
  actual('stopGeneration', { generationRef: { current: new Map() } })('x'); // no bridge in scope: no error
});
