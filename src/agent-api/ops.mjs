import { tidyLayout } from '../canvas/tidy-layout.mjs';
// Canvas edits made by an external agent, expressed as small node-level
// operations. The server applies them to the WDF file and the browser applies
// the very same list to its live canvas, so both sides converge on one result.
//   {op:'upsert', node:{id, ...fields}}  create a card, or merge fields into it
//   {op:'delete', ids:[...]}             remove cards and every line pointing at them
//   {op:'meta', canvas:{name}}           canvas-level fields (only the name today)
import { parentIdsOf, reachesUp, dropParents } from '../canvas/parents.mjs';

export const CARD_W = 224, CARD_H = 110;
const NODE_TYPES = new Set(['thought', 'conversation']);
const EDITABLE = ['title', 'content', 'prompt', 'x', 'y', 'tags', 'parentId', 'extraParentIds', 'manualWidth', 'manualHeight'];

function stripRefs(node, gone) {
  let next = node;
  if (parentIdsOf(node).some(id => gone.has(id))) next = dropParents(next, gone);
  if (next.links?.some(id => gone.has(id))) next = { ...next, links: next.links.filter(id => !gone.has(id)) };
  if (next.relations?.some(r => gone.has(r.targetId))) next = { ...next, relations: next.relations.filter(r => !gone.has(r.targetId)) };
  if (next.contextRelations?.some(r => gone.has(typeof r === 'string' ? r : r?.targetId))) next = { ...next, contextRelations: next.contextRelations.filter(r => !gone.has(typeof r === 'string' ? r : r?.targetId)) };
  return next;
}

// Pure: returns `nodes` itself when nothing changed, so React can skip a render.
export function applyNodeOps(nodes, ops) {
  let list = Array.isArray(nodes) ? nodes : [];
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op?.op === 'upsert' && op.node && typeof op.node.id === 'string') {
      const index = list.findIndex(n => n.id === op.node.id);
      if (index < 0) { list = [...list, op.node]; continue; }
      const merged = { ...list[index], ...op.node };
      if (Array.isArray(merged.extraParentIds) && !merged.extraParentIds.length) delete merged.extraParentIds;
      list = list.slice(); list[index] = merged;
    } else if (op?.op === 'delete' && Array.isArray(op.ids) && op.ids.length) {
      const gone = new Set(op.ids);
      if (!list.some(n => gone.has(n.id))) continue;
      list = list.filter(n => !gone.has(n.id)).map(n => stripRefs(n, gone));
    }
  }
  return list;
}

export function canvasMeta(ops) {
  return Object.assign({}, ...(Array.isArray(ops) ? ops : []).filter(op => op?.op === 'meta' && op.canvas).map(op => op.canvas));
}

export function applyCanvasOps(payload, ops) {
  const meta = canvasMeta(ops);
  const nodes = applyNodeOps(payload.nodes || [], ops);
  const gone = new Set(ops.filter(op => op?.op === 'delete').flatMap(op => op.ids || []));
  return {
    ...payload,
    canvas: Object.keys(meta).length ? { ...payload.canvas, ...meta } : payload.canvas,
    nodes,
    ...(gone.size ? { collapsedIds: (payload.collapsedIds || []).filter(id => !gone.has(id)), selectedId: gone.has(payload.selectedId) ? null : payload.selectedId } : {}),
  };
}

// --- validation -----------------------------------------------------------

export function checkParents(nodes, nodeId, parentIds) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const ids = [...new Set((parentIds || []).filter(Boolean))];
  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`父节点不存在：${id}`);
    if (id === nodeId || (nodeId && reachesUp(byId, id, nodeId))) throw new Error(`连到 ${id} 会形成环`);
  }
  return ids;
}

function cleanText(value, limit = 200_000) {
  return value == null ? undefined : String(value).slice(0, limit);
}

// Only fields an agent is allowed to change; positions must be finite numbers.
export function sanitizePatch(patch = {}) {
  const out = {};
  for (const key of EDITABLE) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (key === 'x' || key === 'y' || key === 'manualWidth' || key === 'manualHeight') { if (Number.isFinite(value)) out[key] = Math.round(value); }
    else if (key === 'tags') { if (Array.isArray(value)) out.tags = value.filter(t => typeof t === 'string').slice(0, 30); }
    else if (key === 'parentId') out.parentId = value ? String(value) : null;
    else if (key === 'extraParentIds') out.extraParentIds = Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
    else out[key] = cleanText(value);
  }
  return out;
}

// --- placement ------------------------------------------------------------

const sizeOf = (node) => ({ width: node.manualWidth || CARD_W, height: node.manualHeight || CARD_H });

// Same rule the canvas uses for a new branch: one column right of the parent,
// in the first free slot near the parent's row.
export function branchPosition(nodes, parent) {
  const x = parent.x + sizeOf(parent).width + 86;
  const offsets = [0, 155, -155, 310, 465, -310, 620, -465, 775, -620, 930, 1085];
  const overlaps = (y) => nodes.some((node) => {
    const size = sizeOf(node);
    return x < node.x + size.width + 28 && x + CARD_W + 28 > node.x && y < node.y + size.height + 28 && y + CARD_H + 28 > node.y;
  });
  const offset = offsets.find((value) => !overlaps(parent.y + value));
  return { x, y: parent.y + (offset ?? offsets.at(-1)) };
}

export function rootPosition(nodes) {
  if (!nodes.length) return { x: 220, y: 220 };
  const minX = Math.min(...nodes.map(n => n.x));
  const maxY = Math.max(...nodes.map(n => n.y + sizeOf(n).height));
  return { x: minX, y: maxY + 120 };
}

// Rough card height for server-side layout; the browser measures real cards.
function estimatedHeight(node) {
  if (node.manualHeight) return node.manualHeight;
  const text = `${node.title || ''}\n${node.content || ''}`;
  return Math.min(360, CARD_H + Math.ceil(Math.min(text.length, 600) / 34) * 6);
}

// Same tidy tree as the app's "arrange": each card next to its own children, trees stacked.
export function layoutTree(nodes) {
  return tidyLayout(nodes, (node) => ({ width: sizeOf(node).width, height: estimatedHeight(node) }));
}

export function layoutOps(nodes) {
  const positions = layoutTree(nodes);
  return nodes.filter(n => { const p = positions.get(n.id); return p && (p.x !== n.x || p.y !== n.y); })
    .map(n => ({ op: 'upsert', node: { id: n.id, ...positions.get(n.id) } }));
}

// --- factories --------------------------------------------------------------

export function questionTitle(text, fallback = 'New question') {
  return String(text || '').trim().replace(/\s+/g, ' ').slice(0, 400) || fallback;
}

export function makeIdea({ id, title, content = '', parentIds = [], position, author = 'Agent' }) {
  const [parentId = null, ...extras] = parentIds;
  return { id, parentId, ...(extras.length ? { extraParentIds: extras } : {}), type: 'thought', author, model: null,
    title: questionTitle(title || content, 'Idea'), content: String(content || ''), prompt: null, attachments: [],
    x: position.x, y: position.y, status: 'done', agentCreated: true };
}

export function makeQuestion({ id, prompt, parentIds = [], position, model = null, modelValue = null }) {
  const [parentId = null, ...extras] = parentIds;
  return { id, parentId, ...(extras.length ? { extraParentIds: extras } : {}), type: 'conversation', author: 'AI', model,
    title: questionTitle(prompt), content: String(prompt), prompt: String(prompt), attachments: [],
    x: position.x, y: position.y, status: 'queued', generationPhase: 'Request queued…', modelValue,
    contextExclusions: [], contextRelations: [], agentCreated: true };
}

// Removing cards: with cascade the whole primary-parent subtree goes; without it
// orphaned children are re-attached to the removed card's own parent.
export function removalOps(nodes, ids, { cascade = false } = {}) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const gone = new Set(ids.filter(id => byId.has(id)));
  if (cascade) {
    let grew = true;
    while (grew) { grew = false; for (const n of nodes) if (!gone.has(n.id) && n.parentId && gone.has(n.parentId)) { gone.add(n.id); grew = true; } }
  }
  const survivorAbove = (id) => { let cursor = byId.get(id); const seen = new Set(); while (cursor && gone.has(cursor.id) && !seen.has(cursor.id)) { seen.add(cursor.id); cursor = cursor.parentId ? byId.get(cursor.parentId) : null; } return cursor?.id || null; };
  const ops = [];
  for (const n of nodes) {
    if (gone.has(n.id) || !n.parentId || !gone.has(n.parentId)) continue;
    const stripped = dropParents(n, gone);
    if (!stripped.parentId) { const up = survivorAbove(n.parentId); if (up) ops.push({ op: 'upsert', node: { id: n.id, parentId: up } }); }
  }
  if (gone.size) ops.push({ op: 'delete', ids: [...gone] });
  return { ops, removed: [...gone] };
}

// --- reading ------------------------------------------------------------------

const clip = (text, limit) => { const value = String(text ?? ''); return limit && value.length > limit ? `${value.slice(0, limit)}…` : value; };

export function summarizeNode(node, { full = false, children = [] } = {}) {
  const limit = full ? 0 : 600;
  return {
    id: node.id, type: node.type, title: clip(node.title, 200),
    ...(node.prompt ? { prompt: clip(node.prompt, limit) } : {}),
    content: clip(node.content, limit),
    parentId: node.parentId || null,
    ...(node.extraParentIds?.length ? { extraParentIds: node.extraParentIds } : {}),
    ...(children.length ? { childIds: children } : {}),
    ...(node.relations?.length ? { references: node.relations.map(r => r.targetId) } : {}),
    status: node.status || 'done',
    ...(node.model ? { model: node.model } : {}),
    ...(node.error ? { error: node.error } : {}),
    x: node.x, y: node.y,
    ...(node.attachments?.length ? { attachments: node.attachments.map(a => a.name) } : {}),
  };
}

export function childMap(nodes) {
  const map = new Map();
  for (const n of nodes) for (const p of parentIdsOf(n)) { if (!map.has(p)) map.set(p, []); map.get(p).push(n.id); }
  return map;
}

export function summarizeCanvas(payload, { full = false } = {}) {
  const nodes = payload.nodes || [];
  const kids = childMap(nodes);
  return {
    id: payload.canvas?.id, name: payload.canvas?.name || '', updatedAt: payload.canvas?.updatedAt,
    revision: payload.agentRevision || 0, nodeCount: nodes.length,
    nodes: nodes.map(n => summarizeNode(n, { full, children: kids.get(n.id) || [] })),
    outline: outline(nodes),
  };
}

// An indented tree an agent can read at a glance; merge cards list their extra parents.
export function outline(nodes, { width = 80 } = {}) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const kids = new Map();
  for (const n of nodes) { const key = n.parentId && byId.has(n.parentId) ? n.parentId : ''; if (!kids.has(key)) kids.set(key, []); kids.get(key).push(n); }
  const lines = [], seen = new Set();
  const label = (n) => clip(String(n.title || n.prompt || n.content || '').replace(/\s+/g, ' '), width);
  const walk = (n, depth) => {
    if (seen.has(n.id)) return; seen.add(n.id);
    const extra = n.extraParentIds?.length ? ` (+parents: ${n.extraParentIds.join(', ')})` : '';
    const state = n.status && n.status !== 'done' ? ` [${n.status}]` : '';
    lines.push(`${'  '.repeat(depth)}- [${n.id}] (${n.type}) ${label(n)}${extra}${state}`);
    for (const child of (kids.get(n.id) || []).sort((a, b) => a.y - b.y)) walk(child, depth + 1);
  };
  for (const root of (kids.get('') || []).sort((a, b) => a.y - b.y)) walk(root, 0);
  return lines.join('\n');
}

export function isNodeType(type) { return NODE_TYPES.has(type); }
