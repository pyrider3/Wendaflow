// AI drawing: the model answers with a small JSON graph, which is validated,
// laid out in columns and merged into the canvas as ordinary idea cards and lines.
import {reachesUp} from './parents.mjs';

export const MAX_DIAGRAM_NODES = 40;
const COLUMN_GAP = 300, ROW_GAP = 130;

export function diagramPrompt(request, existing = []) {
  const known = existing.slice(0, 60).map(n => `${n.id}: ${String(n.title || '').replace(/\s+/g, ' ').slice(0, 40)}`).join('\n');
  return [
    '你是画布绘图助手。把用户的要求画成一张由节点和连线组成的图。',
    '只返回一个 JSON 对象，不要解释，不要 Markdown 代码围栏。每个节点自带它的连线，并且按依赖顺序输出（上游节点在前），画布会边收边画：',
    '{"nodes":[{"id":"n1","title":"节点标题（不超过 20 字）","body":"可选，一句补充","parents":[],"refs":[]},{"id":"n2","title":"…","parents":["n1"],"refs":[]}]}',
    '规则：',
    `- id 用 n1、n2… 且不重复，至多 ${MAX_DIAGRAM_NODES} 个节点。`,
    '- parents：它的上游、来源或前一步（画成父子线）；多个上游汇入同一节点就写多个。只能引用已经出现过的节点。',
    '- refs：只用于真正的回路或反馈（后面的结果回头影响前面），整张图最多 3 条；普通的先后、包含、依赖关系一律用 parents，不要写 refs。大多数图应当没有 refs。',
    '- 标题和补充使用与用户要求相同的语言；标题要短。',
    known ? `画布上已有这些节点，parents/refs 里可用它们的 id 把新节点接到旧节点上：\n${known}` : '',
    `用户要求：${request}`
  ].filter(Boolean).join('\n');
}

// Complete `{...}` objects inside the array under `key`, even while the text is still streaming.
function scanObjects(text, key) {
  const at = text.indexOf(`"${key}"`);
  if (at < 0) return [];
  const open = text.indexOf('[', at);
  if (open < 0) return [];
  const out = [];
  let depth = 0, inString = false, escaped = false, from = -1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{') { if (depth++ === 0) from = i; }
    else if (c === '}') { if (--depth === 0 && from >= 0) { try { out.push(JSON.parse(text.slice(from, i + 1))); } catch { /* skip */ } from = -1; } }
    else if (c === ']' && depth === 0) break;
  }
  return out;
}

// With partial=true an unfinished reply yields whatever has fully arrived (or null) instead of throwing.
export function parseDiagram(text, existingIds = [], { partial = false } = {}) {
  const raw = String(text || '');
  if (!partial && raw.indexOf('{') < 0) throw new Error('模型没有返回图的数据');
  const known = new Set(existingIds);
  const nodes = [], ids = new Set(), embedded = [];
  for (const item of scanObjects(raw, 'nodes')) {
    const id = String(item?.id ?? '').trim(), title = String(item?.title ?? '').trim().slice(0, 80);
    if (!id || !title || ids.has(id) || known.has(id) || nodes.length >= MAX_DIAGRAM_NODES) continue;
    ids.add(id);
    nodes.push({ id, title, body: String(item.body ?? '').trim().slice(0, 400) });
    for (const from of Array.isArray(item.parents) ? item.parents : []) embedded.push({ from: String(from), to: id, kind: 'parent' });
    for (const to of Array.isArray(item.refs) ? item.refs : []) embedded.push({ from: id, to: String(to), kind: 'reference' });
  }
  if (!nodes.length) { if (partial) return null; throw new Error('模型没有画出任何节点'); }
  const edges = [], seen = new Set(), refLimit = Math.min(4, Math.max(1, Math.floor(nodes.length / 6)));
  let refs = 0;
  const ok = id => ids.has(id) || known.has(id);
  for (const item of [...embedded, ...scanObjects(raw, 'edges')]) {
    const from = String(item?.from ?? ''), to = String(item?.to ?? '');
    const kind = item?.kind === 'reference' ? 'reference' : 'parent';
    if (!ok(from) || !ok(to) || from === to || seen.has(`${from}>${to}:${kind}`)) continue;
    // Models over-use reference lines; keep only a few so the picture stays readable.
    if (kind === 'reference' && ++refs > refLimit) continue;
    seen.add(`${from}>${to}:${kind}`);
    edges.push({ from, to, kind });
  }
  return { nodes, edges };
}

// Returns the next node list plus the ids of the cards it created.
export function applyDiagram(existing, diagram, { origin, stamp = Date.now(), author = 'AI' } = {}) {
  const idMap = new Map(diagram.nodes.map((n, i) => [n.id, `draw-${stamp}-${i}`]));
  const byId = new Map(existing.map(n => [n.id, n]));
  const resolve = id => idMap.get(id) || id;
  const isNew = id => idMap.has(id);
  const parents = new Map(diagram.nodes.map(n => [n.id, []]));
  const relations = new Map(diagram.nodes.map(n => [n.id, []]));
  const working = new Map(byId);
  for (const n of diagram.nodes) working.set(idMap.get(n.id), { id: idMap.get(n.id) });
  const parentsOf = id => { const rec = working.get(id); return [rec?.parentId, ...(rec?.extraParentIds || [])].filter(Boolean); };

  for (const edge of diagram.edges) {
    // Lines into an existing card never re-parent it; they become references instead.
    if (edge.kind === 'parent' && isNew(edge.to)) {
      const from = resolve(edge.from), to = resolve(edge.to);
      if (reachesUp(working, from, to)) continue;
      const rec = working.get(to), list = parentsOf(to);
      if (list.includes(from)) continue;
      working.set(to, list.length ? { ...rec, extraParentIds: [...(rec.extraParentIds || []), from] } : { ...rec, parentId: from });
      parents.get(edge.to).push(edge.from);
    } else if (isNew(edge.from)) {
      relations.get(edge.from).push({ targetId: resolve(edge.to), type: 'reference' });
    } else if (edge.kind === 'reference' && byId.has(edge.from)) {
      relations.set(edge.from, [...(relations.get(edge.from) || []), { targetId: resolve(edge.to), type: 'reference' }]);
    }
  }

  // Layer = longest path through new parents, so arrows run left to right.
  const depth = new Map();
  const depthOf = (id, trail = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (trail.has(id)) return 0;
    trail.add(id);
    const ups = (parents.get(id) || []).filter(isNew);
    const value = ups.length ? 1 + Math.max(...ups.map(p => depthOf(p, trail))) : 0;
    trail.delete(id); depth.set(id, value); return value;
  };
  diagram.nodes.forEach(n => depthOf(n.id));
  const anchor = diagram.nodes.map(n => parents.get(n.id).find(p => !isNew(p))).find(Boolean);
  const anchorNode = anchor ? byId.get(anchor) : null;
  const baseX = anchorNode ? anchorNode.x + COLUMN_GAP : origin.x;
  const baseY = anchorNode ? anchorNode.y : origin.y;
  const placedY = new Map(), placed = [];
  const layers = new Map();
  diagram.nodes.forEach((n, i) => { const d = depth.get(n.id); if (!layers.has(d)) layers.set(d, []); layers.get(d).push({ n, i }); });
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    const entries = layers.get(d).map(({ n, i }) => {
      const ys = (parents.get(n.id) || []).map(p => placedY.get(p)).filter(y => y != null);
      return { n, i, want: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null };
    });
    entries.sort((a, b) => (a.want ?? Infinity) - (b.want ?? Infinity) || a.i - b.i);
    let floor = -Infinity, next = baseY;
    for (const e of entries) {
      let y = e.want ?? Math.max(next, floor + ROW_GAP);
      y = Math.max(y, floor + ROW_GAP);
      floor = y; next = y + ROW_GAP; placedY.set(e.n.id, y);
      placed.push({ ...e, x: baseX + d * COLUMN_GAP, y });
    }
  }

  const created = placed.sort((a, b) => a.i - b.i).map(({ n, x, y }) => {
    const rec = working.get(idMap.get(n.id));
    const card = { id: idMap.get(n.id), type: 'thought', author, model: null, title: n.title, content: n.body, prompt: null,
      parentId: rec.parentId || null, x, y, status: 'done', attachments: [] };
    if (rec.extraParentIds?.length) card.extraParentIds = rec.extraParentIds;
    const rel = relations.get(n.id);
    if (rel.length) card.relations = rel.map((r, k) => ({ id: `${card.id}-rel-${k}`, ...r }));
    return card;
  });
  const patched = existing.map(n => {
    const extra = diagram.nodes.length && !idMap.has(n.id) ? relations.get(n.id) : null;
    if (!extra?.length) return n;
    const have = new Set((n.relations || []).map(r => `${r.targetId}:${r.type}`));
    const add = extra.filter(r => !have.has(`${r.targetId}:${r.type}`)).map((r, k) => ({ id: `${n.id}-draw-${stamp}-${k}`, ...r }));
    return add.length ? { ...n, relations: [...(n.relations || []), ...add] } : n;
  });
  return { nodes: [...patched, ...created], createdIds: created.map(c => c.id), edgeCount: created.reduce((sum, c) => sum + (c.parentId ? 1 : 0) + (c.extraParentIds?.length || 0) + (c.relations?.length || 0), 0) };
}
