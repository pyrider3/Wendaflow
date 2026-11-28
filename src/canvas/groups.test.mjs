import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  containedNodeIds,
  containedCardCount,
  expandDragIdsWithGroups,
  groupBoundsForNodes,
  nextGroupTitle,
  smartGroupTitle,
  createGroupNode,
  resizeGroupRect,
  marqueeHitsScreenRect,
  sortNodesForRender,
  captureGroupMembers,
  refitGroupsAfterLayout,
  collapsedGroupRect,
  visualGroupRect,
  hiddenByCollapsedGroups,
  enclosingGroupsFor,
  outermostLockedGroupFor,
  isBigTitleActive,
  nextBorderStyle,
  captureAutoFitOwners,
  applyAutoFitToNodes,
  refitAutoFitGroupsForDrop,
  computeDetachPosition,
  collectSubtreeIds,
} from './groups.mjs';
import { normalizeWdf } from './document.mjs';
import { toSVG, toMarkdown } from './export.mjs';

const sizesOf = (entries) => new Map(entries);

test('spatial containment detects cards and nested smaller groups, ignoring outside and larger groups', () => {
  const outer = createGroupNode({ id: 'g-outer', title: 'Outer', x: 0, y: 0, manualWidth: 600, manualHeight: 400 });
  const inner = createGroupNode({ id: 'g-inner', title: 'Inner', x: 40, y: 60, manualWidth: 260, manualHeight: 180 });
  const cardInInner = { id: 'c1', type: 'thought', title: '123', x: 70, y: 110, manualWidth: 100, manualHeight: 50 };
  const cardInOuter = { id: 'c2', type: 'thought', title: '23432', x: 420, y: 120, manualWidth: 100, manualHeight: 50 };
  const cardOutside = { id: 'c3', type: 'thought', title: 'out', x: 700, y: 120, manualWidth: 100, manualHeight: 50 };
  const nodes = [outer, inner, cardInInner, cardInOuter, cardOutside];
  const sizes = sizesOf([
    ['g-outer', { width: 600, height: 400 }],
    ['g-inner', { width: 260, height: 180 }],
    ['c1', { width: 100, height: 50 }],
    ['c2', { width: 100, height: 50 }],
    ['c3', { width: 100, height: 50 }],
  ]);

  assert.deepEqual(new Set(containedNodeIds(inner, nodes, sizes)), new Set(['c1']));
  assert.deepEqual(new Set(containedNodeIds(outer, nodes, sizes)), new Set(['g-inner', 'c1', 'c2']));
  assert.equal(containedCardCount(outer, nodes, sizes), 2);
});

test('collapsed groups center a compact pill, hide descendants, preserve nested collapse, and always drag hidden cards', () => {
  const outer = createGroupNode({ id: 'g-outer', title: 'Architecture', x: 0, y: 0, manualWidth: 600, manualHeight: 400, collapsed: true });
  const inner = createGroupNode({ id: 'g-inner', title: 'Sub', x: 40, y: 60, manualWidth: 260, manualHeight: 180, collapsed: true });
  const c1 = { id: 'c1', type: 'thought', title: '123', x: 70, y: 110 };
  const c2 = { id: 'c2', type: 'thought', title: '234', x: 420, y: 120 };
  const cOut = { id: 'c-out', type: 'thought', title: 'out', x: 720, y: 120 };
  // Even if sizes accidentally held a shrunk DOM measurement for g-outer, authoritative manualWidth/Height win.
  const sizes = sizesOf([
    ['g-outer', { width: 180, height: 54 }],
    ['c1', { width: 100, height: 50 }],
    ['c2', { width: 100, height: 50 }],
    ['c-out', { width: 100, height: 50 }],
  ]);

  const pill = collapsedGroupRect(outer);
  assert.equal(pill.height, 54);
  assert.equal(Math.round(pill.x + pill.width / 2), 300);
  assert.equal(Math.round(pill.y + pill.height / 2), 200);
  assert.equal(pill.expanded.width, 600);
  assert.equal(visualGroupRect(outer, sizes).height, 54);

  const hiddenWhileOuterCollapsed = hiddenByCollapsedGroups([outer, inner, c1, c2, cOut], sizes);
  assert.deepEqual(hiddenWhileOuterCollapsed, new Set(['g-inner', 'c1', 'c2']));

  // Unfolding outer reveals inner (still collapsed) & c2, while keeping inner's c1 hidden.
  const outerOpen = { ...outer, collapsed: false };
  const hiddenAfterOuterOpen = hiddenByCollapsedGroups([outerOpen, inner, c1, c2, cOut], sizes);
  assert.deepEqual(hiddenAfterOuterOpen, new Set(['c1']));

  // Dragging a collapsed group always carries its hidden contents even with moveFrameOnly=true.
  assert.deepEqual(
    new Set(expandDragIdsWithGroups(['g-outer'], [outer, inner, c1, c2, cOut], sizes, { moveFrameOnly: true })),
    new Set(['g-outer', 'g-inner', 'c1', 'c2']),
  );
});

test('outermostLockedGroupFor redirects inner cards and subgroups to the outermost locked container', () => {
  const outer = createGroupNode({ id: 'g-outer', title: 'Outer', x: 0, y: 0, manualWidth: 600, manualHeight: 400, locked: true });
  const inner = createGroupNode({ id: 'g-inner', title: 'Inner', x: 40, y: 60, manualWidth: 260, manualHeight: 180, locked: true });
  const c1 = { id: 'c1', type: 'thought', x: 70, y: 110 };
  const cOut = { id: 'c-out', type: 'thought', x: 700, y: 110 };
  const nodes = [outer, inner, c1, cOut];
  const sizes = sizesOf([['c1', { width: 100, height: 50 }], ['c-out', { width: 100, height: 50 }]]);

  assert.equal(outermostLockedGroupFor('c1', nodes, sizes)?.id, 'g-outer');
  assert.equal(outermostLockedGroupFor('g-inner', nodes, sizes)?.id, 'g-outer');
  assert.equal(outermostLockedGroupFor('g-outer', nodes, sizes), null);
  assert.equal(outermostLockedGroupFor('c-out', nodes, sizes), null);
  assert.deepEqual(enclosingGroupsFor('c1', nodes, sizes).map((g) => g.id), ['g-inner', 'g-outer']);
});

test('isBigTitleActive matches Project Graph zoom, view-ratio, collapse, and border-style rules', () => {
  const solid = createGroupNode({ id: 'g1', title: 'Core', x: 0, y: 0, manualWidth: 500, manualHeight: 320 });
  const dashed = createGroupNode({ id: 'g2', title: 'Soft', x: 0, y: 0, manualWidth: 500, manualHeight: 320, borderStyle: 'dashed' });
  const borderless = createGroupNode({ id: 'g3', title: 'Area', x: 0, y: 0, manualWidth: 500, manualHeight: 320, borderStyle: 'none' });
  const collapsed = createGroupNode({ id: 'g4', title: 'Folded', x: 0, y: 0, manualWidth: 500, manualHeight: 320, collapsed: true });
  const huge = createGroupNode({ id: 'g5', title: 'Huge', x: 0, y: 0, manualWidth: 3200, manualHeight: 2400 });
  const view = { width: 1280, height: 720 };

  assert.equal(isBigTitleActive(solid, { zoom: 0.8 }, view), false);
  assert.equal(isBigTitleActive(solid, { zoom: 0.35 }, view), true);
  assert.equal(isBigTitleActive(dashed, { zoom: 0.35 }, view), false);
  assert.equal(isBigTitleActive(borderless, { zoom: 0.35 }, view), false);
  assert.equal(isBigTitleActive(collapsed, { zoom: 0.35 }, view), false);
  assert.equal(isBigTitleActive(huge, { zoom: 0.42 }, view), false);
  assert.equal(nextBorderStyle('solid'), 'dashed');
  assert.equal(nextBorderStyle('dashed'), 'none');
  assert.equal(nextBorderStyle('none'), 'solid');
});

test('smartGroupTitle names a packed tree after its single root card and falls back cleanly', () => {
  const root = { id: 'r', type: 'thought', title: 'Poisson Process Core Ideas', parentId: null };
  const child = { id: 'c', type: 'thought', title: 'Detail', parentId: 'r' };
  const other = { id: 'o', type: 'thought', title: 'Unrelated', parentId: null };
  assert.equal(smartGroupTitle([root, child], [root, child], '分组'), 'Poisson Proces…');
  assert.equal(smartGroupTitle([child], [root, child], '分组'), 'Detail');
  assert.equal(smartGroupTitle([root, other], [root, other], '分组'), '分组 1');
});

test('live autoFit expands/shrinks nested groups as cards move and refits on drop', () => {
  const outer = createGroupNode({ id: 'g-outer', title: 'Outer', x: 0, y: 0, manualWidth: 500, manualHeight: 360, autoFit: true });
  const inner = createGroupNode({ id: 'g-inner', title: 'Inner', x: 40, y: 60, manualWidth: 260, manualHeight: 180, autoFit: true });
  const c1 = { id: 'c1', type: 'thought', x: 80, y: 120 };
  const c2 = { id: 'c2', type: 'thought', x: 360, y: 140 };
  const cDrop = { id: 'c-drop', type: 'thought', x: 700, y: 140 };
  const sizes = sizesOf([['c1', { width: 100, height: 50 }], ['c2', { width: 100, height: 50 }], ['c-drop', { width: 100, height: 50 }]]);

  const owners = captureAutoFitOwners(['c1'], [outer, inner, c1, c2], sizes);
  assert.deepEqual(owners.map((o) => o.groupId), ['g-inner', 'g-outer']);

  const movedNodes = [outer, inner, { ...c1, x: 520, y: 260 }, c2];
  const fitted = applyAutoFitToNodes(movedNodes, sizes, owners);
  const nextInner = fitted.find((n) => n.id === 'g-inner');
  const nextOuter = fitted.find((n) => n.id === 'g-outer');
  assert.ok(nextInner.x + nextInner.manualWidth >= 520 + 100 + 32);
  assert.ok(nextOuter.x + nextOuter.manualWidth >= nextInner.x + nextInner.manualWidth);

  // Drop-time refit when an external card lands inside an autoFit group.
  const droppedIn = [outer, c2, { ...cDrop, x: 420, y: 310 }];
  const afterDrop = refitAutoFitGroupsForDrop(droppedIn, sizes, ['c-drop']);
  const grown = afterDrop.find((n) => n.id === 'g-outer');
  assert.ok(grown.y + grown.manualHeight >= 310 + 50 + 32);
});

test('computeDetachPosition and collectSubtreeIds support Project Graph detach & subtree pack', () => {
  const group = createGroupNode({ id: 'g1', title: 'S', x: 100, y: 100, manualWidth: 300, manualHeight: 200 });
  const c1 = { id: 'c1', type: 'thought', parentId: null, x: 140, y: 160 };
  const c2 = { id: 'c2', type: 'thought', parentId: 'c1', x: 260, y: 160 };
  const c3 = { id: 'c3', type: 'thought', parentId: 'c2', x: 380, y: 160 };
  const sizes = sizesOf([['c1', { width: 100, height: 50 }]]);

  const detached = computeDetachPosition(c1, group, sizes);
  assert.equal(detached.x, 436);
  assert.equal(detached.y, 160);
  assert.deepEqual(collectSubtreeIds('c1', [group, c1, c2, c3]), ['c1', 'c2', 'c3']);
});

test('expandDragIdsWithGroups moves contained cards together unless Alt (moveFrameOnly) is set', () => {
  const group = createGroupNode({ id: 'g1', title: 'Section_0', x: 100, y: 100, manualWidth: 400, manualHeight: 300 });
  const c1 = { id: 'c1', type: 'thought', x: 150, y: 180 };
  const c2 = { id: 'c2', type: 'thought', x: 650, y: 180 };
  const nodes = [group, c1, c2];
  const sizes = sizesOf([['g1', { width: 400, height: 300 }], ['c1', { width: 100, height: 50 }], ['c2', { width: 100, height: 50 }]]);

  assert.deepEqual(new Set(expandDragIdsWithGroups(['g1'], nodes, sizes)), new Set(['g1', 'c1']));
  assert.deepEqual(expandDragIdsWithGroups(['g1'], nodes, sizes, { moveFrameOnly: true }), ['g1']);
});

test('groupBoundsForNodes wraps selected cards with header padding and nextGroupTitle avoids collisions', () => {
  const c1 = { id: 'c1', type: 'thought', x: 100, y: 120 };
  const c2 = { id: 'c2', type: 'thought', x: 320, y: 240 };
  const sizes = sizesOf([['c1', { width: 120, height: 60 }], ['c2', { width: 140, height: 70 }]]);
  const bounds = groupBoundsForNodes([c1, c2], sizes);
  assert.equal(bounds.x, 68);
  assert.equal(bounds.y, 68);
  assert.equal(bounds.manualWidth, 424);
  assert.equal(bounds.manualHeight, 274);

  const empty = groupBoundsForNodes([], sizes, { fallbackCenter: { x: 400, y: 300 } });
  assert.equal(empty.x, 220);
  assert.equal(empty.y, 180);
  assert.equal(empty.manualWidth, 360);
  assert.equal(empty.manualHeight, 240);

  assert.equal(nextGroupTitle([{ type: 'group', title: '分组 1' }, { type: 'group', title: '分组_2' }], '分组'), '分组 3');
});

test('resizeGroupRect handles all 8 directions and clamps cleanly without flipping origin', () => {
  const origin = { x: 100, y: 100, width: 300, height: 200 };
  assert.deepEqual(resizeGroupRect(origin, 'se', 80, 50), { x: 100, y: 100, manualWidth: 380, manualHeight: 250 });
  assert.deepEqual(resizeGroupRect(origin, 'nw', -40, -30), { x: 60, y: 70, manualWidth: 340, manualHeight: 230 });
  assert.deepEqual(resizeGroupRect(origin, 'w', 500, 0), { x: 220, y: 100, manualWidth: 180, manualHeight: 200 });
  assert.deepEqual(resizeGroupRect(origin, 'n', 0, 500), { x: 100, y: 180, manualWidth: 300, manualHeight: 120 });
});

test('marqueeHitsScreenRect treats open groups as header/enclosing-only and collapsed/locked groups as solid blocks', () => {
  const open = createGroupNode({ id: 'g1', title: 'Section_0', x: 0, y: 0, manualWidth: 500, manualHeight: 400 });
  const collapsed = createGroupNode({ id: 'g2', title: 'Folded', x: 0, y: 0, manualWidth: 220, manualHeight: 54, collapsed: true });
  const locked = createGroupNode({ id: 'g3', title: 'Locked', x: 0, y: 0, manualWidth: 500, manualHeight: 400, locked: true });
  const card = { id: 'c1', type: 'thought', x: 100, y: 150 };
  const groupRect = { left: 0, top: 0, right: 500, bottom: 400 };
  const cardRect = { left: 100, top: 150, right: 200, bottom: 210 };
  const insideBox = { startX: 80, startY: 130, x: 240, y: 240 };

  assert.equal(marqueeHitsScreenRect(card, cardRect, insideBox, 1), true);
  assert.equal(marqueeHitsScreenRect(open, groupRect, insideBox, 1), false);
  assert.equal(marqueeHitsScreenRect(locked, groupRect, insideBox, 1), true);
  assert.equal(marqueeHitsScreenRect(collapsed, { left: 100, top: 150, right: 320, bottom: 204 }, insideBox, 1), true);

  const headerBox = { startX: 20, startY: 10, x: 90, y: 28 };
  assert.equal(marqueeHitsScreenRect(open, groupRect, headerBox, 1), true);

  const enclosingBox = { startX: -10, startY: -10, x: 520, y: 420 };
  assert.equal(marqueeHitsScreenRect(open, groupRect, enclosingBox, 1), true);
});

test('sortNodesForRender orders larger groups behind smaller nested groups and all groups behind cards', () => {
  const big = createGroupNode({ id: 'big', title: 'Big', x: 0, y: 0, manualWidth: 800, manualHeight: 500 });
  const small = createGroupNode({ id: 'small', title: 'Small', x: 20, y: 20, manualWidth: 260, manualHeight: 180 });
  const card = { id: 'card', type: 'thought', x: 40, y: 80 };
  const ordered = sortNodesForRender([card, small, big], new Map());
  assert.deepEqual(ordered.map((item) => item.id), ['big', 'small', 'card']);
});

test('refitGroupsAfterLayout keeps groups wrapped around relocated member cards', () => {
  const group = createGroupNode({ id: 'g1', title: 'S', x: 0, y: 0, manualWidth: 400, manualHeight: 300 });
  const c1 = { id: 'c1', type: 'thought', x: 50, y: 80 };
  const c2 = { id: 'c2', type: 'thought', x: 180, y: 140 };
  const sizes = sizesOf([['g1', { width: 400, height: 300 }], ['c1', { width: 100, height: 50 }], ['c2', { width: 100, height: 50 }]]);
  const members = captureGroupMembers([group, c1, c2], sizes);
  const newPositions = new Map([['c1', { x: 500, y: 200 }], ['c2', { x: 700, y: 260 }]]);
  const updates = refitGroupsAfterLayout([group, c1, c2], newPositions, (n) => sizes.get(n.id), members);
  const patch = updates.get('g1');
  assert.equal(patch.x, 468);
  assert.equal(patch.y, 148);
  assert.equal(patch.manualWidth, 364);
  assert.equal(patch.manualHeight, 194);
});

test('normalizeWdf, SVG export (solid/dashed/title/collapsed), and Markdown export handle Project Graph sections', () => {
  const dashed = createGroupNode({ id: 'g1', title: 'Section_0', x: 0, y: 0, manualWidth: 420, manualHeight: 280, borderStyle: 'dashed', fillMode: 'title', locked: true, autoFit: true });
  const collapsed = createGroupNode({ id: 'g2', title: 'Collapsed_Box', x: 600, y: 0, manualWidth: 360, manualHeight: 240, collapsed: true });
  const card = { id: 'c1', type: 'thought', title: '123', content: '', x: 40, y: 90 };
  const hiddenCard = { id: 'c2', type: 'thought', title: 'Hidden_In_Collapsed', content: '', x: 680, y: 90 };

  const wdf = normalizeWdf({
    format: 'branchspace-wdf',
    version: 1,
    nodes: [{ ...dashed, parentId: 'c1' }, { ...collapsed, borderStyle: 'bogus' }, card, hiddenCard],
  });
  assert.equal(wdf.nodes[0].type, 'group');
  assert.equal(wdf.nodes[0].parentId, null);
  assert.equal(wdf.nodes[0].borderStyle, 'dashed');
  assert.equal(wdf.nodes[0].fillMode, 'title');
  assert.equal(wdf.nodes[0].locked, true);
  assert.equal(wdf.nodes[0].autoFit, true);
  assert.equal(wdf.nodes[1].collapsed, true);
  assert.equal(wdf.nodes[1].borderStyle, undefined);

  const { svg } = toSVG([dashed, collapsed, card, hiddenCard], { theme: 'dark', tidy: false });
  assert.match(svg, /data-group="g1"/);
  assert.match(svg, /stroke-dasharray="7 5"/);
  assert.match(svg, />Section_0</);
  assert.match(svg, /data-group="g2" data-collapsed="true"/);
  assert.match(svg, />Collapsed_Box · 1</);
  assert.ok(!svg.includes('Hidden_In_Collapsed'), 'cards inside collapsed group are hidden in SVG');
  assert.ok(svg.indexOf('data-group="g1"') < svg.indexOf('>123<'), 'group frame renders behind cards in SVG');

  const md = toMarkdown([dashed, card]);
  assert.match(md, /123/);
  assert.ok(!md.includes('Section_0'), 'markdown outline focuses on actual cards');
});

test('GroupFrame and CSS follow modern-web-guidance toolbar, fluid-scaling, and IME-safe rules', () => {
  const jsx = fs.readFileSync(new URL('../cards/GroupFrame.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../cards/group-frame.css', import.meta.url), 'utf8');
  assert.match(jsx, /event\.isComposing \|\| event\.keyCode === 229/);
  assert.match(jsx, /role="toolbar"/);
  assert.match(jsx, /focusgroup:\s*"toolbar wrap"/);
  assert.match(jsx, /"focusGroup" in HTMLElement\.prototype/);
  assert.match(jsx, /normalizeGroupSwatch/);
  assert.match(jsx, /Array\.isArray\(entry\)/);
  assert.match(jsx, /group-expanded-preview/);
  assert.match(jsx, /group-big-cover/);
  assert.match(jsx, /group-lock-corner/);
  assert.match(css, /container-type:\s*size/);
  assert.match(css, /@supports \(font-size: 1cqi\)/);
  assert.match(css, /\.group-tool-btn\[aria-pressed="true"\]/);
});
