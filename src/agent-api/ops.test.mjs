import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodeOps, applyCanvasOps, removalOps, checkParents, layoutOps, outline, branchPosition, sanitizePatch, summarizeCanvas, makeQuestion } from './ops.mjs';
import { normalizeWdf } from '../canvas/document.mjs';
import { parseCliArgs } from './cli-args.mjs';
import { agentRevisions } from './revisions.mjs';

const tree = () => [
  { id: 'a', type: 'thought', title: 'A', content: '', parentId: null, x: 0, y: 0 },
  { id: 'b', type: 'conversation', title: 'B', content: 'answer', parentId: 'a', x: 300, y: 0, relations: [{ id: 'r', targetId: 'a', type: 'reference' }] },
  { id: 'c', type: 'thought', title: 'C', content: '', parentId: 'a', x: 300, y: 160 },
  { id: 'm', type: 'thought', title: 'Merge', content: '', parentId: 'b', extraParentIds: ['c'], x: 600, y: 80, links: ['c'] },
];

test('upserts merge fields into existing cards, append new ones and keep identity when nothing changes', () => {
  const nodes = tree();
  assert.equal(applyNodeOps(nodes, []), nodes);
  assert.equal(applyNodeOps(nodes, [{ op: 'delete', ids: ['missing'] }]), nodes);
  const next = applyNodeOps(nodes, [{ op: 'upsert', node: { id: 'a', title: 'A2' } }, { op: 'upsert', node: { id: 'n', type: 'thought', title: 'N', x: 1, y: 2 } }]);
  assert.equal(next.find(n => n.id === 'a').title, 'A2');
  assert.equal(next.find(n => n.id === 'a').x, 0);
  assert.equal(next.at(-1).id, 'n');
  assert.equal(nodes[0].title, 'A', 'input is not mutated');
  const cleared = applyNodeOps(nodes, [{ op: 'upsert', node: { id: 'm', extraParentIds: [] } }]);
  assert.equal('extraParentIds' in cleared.find(n => n.id === 'm'), false);
});

test('deleting a card removes every line that pointed at it, and extra parents are promoted', () => {
  const next = applyNodeOps(tree(), [{ op: 'delete', ids: ['b', 'c'] }]);
  const merge = next.find(n => n.id === 'm');
  assert.equal(merge.parentId, null);
  assert.equal(merge.extraParentIds, undefined);
  assert.deepEqual(merge.links, []);
  const onlyB = applyNodeOps(tree(), [{ op: 'delete', ids: ['b'] }]).find(n => n.id === 'm');
  assert.equal(onlyB.parentId, 'c', 'the extra parent becomes the primary one');
  assert.equal(normalizeWdf({ format: 'branchspace-wdf', nodes: next }).nodes.length, 2);
});

test('removal re-attaches orphans to the nearest surviving ancestor unless cascading', () => {
  const nodes = [...tree(), { id: 'd', type: 'thought', title: 'D', parentId: 'm', x: 900, y: 80 }];
  const soft = removalOps(nodes, ['b']);
  assert.deepEqual(soft.removed, ['b']);
  const after = applyNodeOps(nodes, soft.ops);
  assert.equal(after.find(n => n.id === 'm').parentId, 'c');
  const lone = removalOps([{ id: 'r', parentId: null, x: 0, y: 0 }, { id: 'k', parentId: 'r', x: 0, y: 0 }, { id: 'g', parentId: 'k', x: 0, y: 0 }], ['k']);
  assert.equal(applyNodeOps([{ id: 'r', parentId: null, x: 0, y: 0 }, { id: 'k', parentId: 'r', x: 0, y: 0 }, { id: 'g', parentId: 'k', x: 0, y: 0 }], lone.ops).find(n => n.id === 'g').parentId, 'r');
  const hard = removalOps(nodes, ['b'], { cascade: true });
  assert.deepEqual(hard.removed.sort(), ['b', 'd', 'm']);
});

test('parent checks reject missing cards and cycles through extra parents', () => {
  const nodes = tree();
  assert.deepEqual(checkParents(nodes, 'new', ['a', 'a', 'c']), ['a', 'c']);
  assert.throws(() => checkParents(nodes, 'new', ['zzz']), /不存在/);
  assert.throws(() => checkParents(nodes, 'c', ['m']), /环/);
  assert.throws(() => checkParents(nodes, 'a', ['a']), /环/);
});

test('canvas ops rename, clean collapsed/selected ids, and patches only allow known fields', () => {
  const payload = { canvas: { id: 'x', name: 'old' }, nodes: tree(), collapsedIds: ['b', 'a'], selectedId: 'b' };
  const next = applyCanvasOps(payload, [{ op: 'meta', canvas: { name: 'new' } }, { op: 'delete', ids: ['b'] }]);
  assert.equal(next.canvas.name, 'new');
  assert.deepEqual(next.collapsedIds, ['a']);
  assert.equal(next.selectedId, null);
  assert.deepEqual(sanitizePatch({ title: 'T', x: 'nope', y: 4.6, status: 'done', id: 'hijack', tags: ['a', 1] }), { title: 'T', y: 5, tags: ['a'] });
});

test('layout and placement keep cards from overlapping and the outline shows merges', () => {
  const nodes = tree();
  const moved = applyNodeOps(nodes, layoutOps(nodes));
  const byId = new Map(moved.map(n => [n.id, n]));
  assert.ok(byId.get('b').x > byId.get('a').x && byId.get('m').x > byId.get('b').x);
  assert.notEqual(byId.get('b').y, byId.get('c').y);
  const spot = branchPosition(nodes, nodes[0]);
  assert.ok(!nodes.some(n => Math.abs(n.x - spot.x) < 224 && Math.abs(n.y - spot.y) < 110));
  const text = outline(nodes);
  assert.match(text, /- \[a\] \(thought\) A\n {2}- \[b\]/);
  assert.match(text, /\[m\].*\+parents: c/);
  const summary = summarizeCanvas({ canvas: { id: 'x', name: 'X' }, nodes, agentRevision: 3 });
  assert.equal(summary.revision, 3);
  assert.deepEqual(summary.nodes.find(n => n.id === 'a').childIds, ['b', 'c']);
  const q = makeQuestion({ id: 'q', prompt: '  why  ', parentIds: ['a', 'c'], position: { x: 1, y: 2 } });
  assert.equal(q.parentId, 'a'); assert.deepEqual(q.extraParentIds, ['c']); assert.equal(q.status, 'queued'); assert.equal(q.title, 'why');
});

test('CLI arguments keep types, but ids and text stay strings', () => {
  const { args, out } = parseCliArgs(['--prompt', '42', '--wait=false', '--nodes', '[{"title":"x"}]', '--json', '{"canvasId":"c1"}', '--out', 'a.png', '--full']);
  assert.deepEqual(args, { prompt: '42', wait: false, nodes: [{ title: 'x' }], canvasId: 'c1', full: true });
  assert.equal(out, 'a.png');
  assert.throws(() => parseCliArgs(['stray']), /Unexpected/);
});

test('browser revision store only moves forward and survives broken storage', () => {
  let data = null;
  const store = { getItem: () => data, setItem: (_k, v) => { data = v; } };
  const revs = agentRevisions(store);
  revs.set('c', 3); revs.set('c', 2);
  assert.equal(agentRevisions(store).get('c'), 3);
  const broken = agentRevisions({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
  broken.set('c', 1);
  assert.equal(broken.get('c'), 1);
});
