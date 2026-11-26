import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyLayout } from './tidy-layout.mjs';

const size = () => ({ width: 200, height: 60 });

test('children sit in the next column, stacked, with the parent centred on them', () => {
  const nodes = [
    { id: 'r', parentId: null, x: 0, y: 0 },
    { id: 'a', parentId: 'r', x: 0, y: 10 },
    { id: 'b', parentId: 'r', x: 0, y: 20 },
    { id: 'c', parentId: 'r', x: 0, y: 30 },
  ];
  const at = tidyLayout(nodes, size, { left: 0, top: 0, columnGap: 100, rowGap: 20 });
  assert.equal(at.get('a').x, 300);
  assert.deepEqual(['a', 'b', 'c'].map((id) => at.get(id).y), [0, 80, 160]);
  assert.equal(at.get('r').y, 80);
});

test('each subtree keeps its own band, so cousins never interleave', () => {
  const nodes = [
    { id: 'r', parentId: null, x: 0, y: 0 },
    { id: 'p1', parentId: 'r', x: 0, y: 0 }, { id: 'p2', parentId: 'r', x: 0, y: 1 },
    { id: 'p1a', parentId: 'p1', x: 0, y: 0 }, { id: 'p1b', parentId: 'p1', x: 0, y: 1 }, { id: 'p1c', parentId: 'p1', x: 0, y: 2 },
    { id: 'p2a', parentId: 'p2', x: 0, y: 0 },
  ];
  const at = tidyLayout(nodes, size, { left: 0, top: 0, rowGap: 20 });
  const bottomOfP1 = Math.max(...['p1a', 'p1b', 'p1c'].map((id) => at.get(id).y + 60));
  assert.ok(at.get('p2a').y >= bottomOfP1, 'p2 children start below all of p1 children');
  assert.ok(at.get('p1').y > at.get('p1a').y && at.get('p1').y < at.get('p1c').y);
});

test('separate trees stack, tall cards get room, and cycles or missing parents do not break it', () => {
  const tall = (node) => ({ width: 200, height: node.id === 'big' ? 300 : 60 });
  const nodes = [
    { id: 't1', parentId: null, x: 0, y: 0 }, { id: 'big', parentId: 't1', x: 0, y: 0 },
    { id: 't2', parentId: 'ghost', x: 0, y: 500 },
    { id: 'c1', parentId: 'c2', x: 0, y: 900 }, { id: 'c2', parentId: 'c1', x: 0, y: 950 },
  ];
  const at = tidyLayout(nodes, tall, { left: 0, top: 0, treeGap: 50 });
  assert.equal(at.size, 5);
  assert.ok(at.get('t2').y >= 300 + 50, 'second tree starts below the tall card');
  assert.ok(at.get('c1').y > at.get('t2').y);
});
