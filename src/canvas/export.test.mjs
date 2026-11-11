import test from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, toSVG, toHTML, wrapText, escapeXml } from './export.mjs';

const nodes = [
  { id: 'a', type: 'conversation', title: '根问题', prompt: '为什么天空是蓝的？', content: '因为瑞利散射。', x: 0, y: 0 },
  { id: 'b', type: 'thought', title: '子想法 <b>', content: '', parentId: 'a', x: 300, y: 0 },
  { id: 'c', type: 'thought', title: '汇合', content: 'two parents', parentId: 'b', extraParentIds: ['a'], x: 600, y: 100, relations: [{ targetId: 'a', type: 'reference' }] },
];

test('markdown outline follows the tree and notes extra parents and references', () => {
  const md = toMarkdown(nodes, { title: 'Demo' });
  assert.match(md, /^# Demo\n/);
  assert.match(md, /## 根问题/);
  assert.match(md, /> 为什么天空是蓝的？/);
  assert.match(md, /### 子想法 <b>/);
  assert.match(md, /#### 汇合/);
  assert.match(md, /Also follows: 根问题/);
  assert.match(md, /See also: 根问题/);
});

test('markdown keeps nodes in parent cycles instead of dropping them', () => {
  const md = toMarkdown([{ id: 'x', title: 'X', parentId: 'y', x: 0, y: 0 }, { id: 'y', title: 'Y', parentId: 'x', x: 0, y: 0 }]);
  assert.match(md, /X/); assert.match(md, /Y/);
});

test('svg escapes text, draws every card and one path per parent line plus reference', () => {
  const { svg, width, height } = toSVG(nodes);
  assert.ok(width > 600 && height > 100);
  assert.match(svg, /子想法 &lt;b&gt;/);
  assert.equal((svg.match(/<rect x=.*rx="12"/g) || []).length, 3);
  assert.equal((svg.match(/<path /g) || []).length, 4); // b<-a, c<-b, c<-a, ref c->a
  assert.equal((svg.match(/stroke-dasharray/g) || []).length, 2);
  assert.ok(!svg.includes('<b>'));
});

test('svg of an empty canvas still renders', () => {
  assert.match(toSVG([]).svg, /Empty canvas/);
});

test('wrapText wraps CJK and latin and truncates with an ellipsis', () => {
  assert.ok(wrapText('一二三四五六七八九十'.repeat(10), 100, 12, 3).length === 3);
  assert.ok(wrapText('一二三四五六七八九十'.repeat(10), 100, 12, 3)[2].endsWith('…'));
  assert.deepEqual(wrapText('hi', 100, 12, 3), ['hi']);
});

test('html wraps the svg and escapes the title', () => {
  const html = toHTML(nodes, { title: 'A & B', theme: 'dark' });
  assert.match(html, /<title>A &amp; B<\/title>/);
  assert.match(html, /<svg /);
  assert.equal(escapeXml('<&>'), '&lt;&amp;&gt;');
});
