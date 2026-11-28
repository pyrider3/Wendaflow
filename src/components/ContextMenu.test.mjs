import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveContextMenuOpen,
  resolveMenuTargetNodes,
  sharedNodeColor,
  recolorNodes,
} from './contextMenuHelpers.mjs';

const jsx = fs.readFileSync(new URL('./ContextMenu.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./context-menu.css', import.meta.url), 'utf8');

// Extract pure helper clampMenuPosition directly without needing CSS/JSX transform.
const match = jsx.match(/export function clampMenuPosition[\s\S]*?\n\}/);
assert.ok(match, 'clampMenuPosition must be exported from ContextMenu.jsx');
const clampMenuPosition = new Function(`${match[0].replace(/^export\s+/, '')}; return clampMenuPosition;`)();

test('clampMenuPosition keeps context menus inside viewport edges and flips cleanly near bottom-right', () => {
  assert.deepEqual(clampMenuPosition(200, 180, 240, 260, 1280, 800), { left: 200, top: 180 });
  // Near right & bottom edges: flips to the left and above cursor.
  assert.deepEqual(clampMenuPosition(1240, 760, 240, 260, 1280, 800), { left: 1000, top: 500 });
  // Extreme top-left: stays within safety margin.
  assert.deepEqual(clampMenuPosition(-20, -15, 240, 260, 1280, 800), { left: 10, top: 10 });
  // Very small viewport where flipping would underflow: clamps within margin.
  assert.deepEqual(clampMenuPosition(180, 150, 240, 260, 320, 320), { left: 70, top: 50 });
});

test('ContextMenu follows modern-web-guidance context-menu and menu platform patterns', () => {
  // Native Popover API + cursor anchor + showPopover({ source })
  assert.match(jsx, /popover=\{supportsPopover \? "auto" : undefined\}/);
  assert.match(jsx, /showPopover\(\{ source: anchor \}\)/);
  assert.match(jsx, /wf-menu-anchor/);
  // Nested focusgroup="menu nomemory" with native feature detection before adding fallback ARIA roles
  assert.match(jsx, /focusgroup:\s*"menu nomemory"/);
  assert.match(jsx, /"focusGroup" in HTMLElement\.prototype/);
  assert.match(jsx, /list\.setAttribute\("role", "menu"\)/);
  // Native <hr> separator (never styled div)
  assert.match(jsx, /<hr className="wf-menu-sep" \/>/);
  // Anchor positioning gated under @supports + discrete popover open/close transitions + forced-colors
  assert.match(css, /@supports \(position-area: block-end\)/);
  assert.match(css, /position-area:\s*block-end span-inline-end/);
  assert.match(css, /position-try-fallbacks:\s*flip-block, flip-inline, flip-block flip-inline/);
  assert.match(css, /transition-behavior:\s*allow-discrete/);
  assert.match(css, /@starting-style/);
  assert.match(css, /@supports selector\(:popover-open\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.wf-menu-item\.is-checkable\[aria-checked="true"\]::before/);
  // Mixed multi-selection colors (`activeValue: null`) must not falsely activate the default "" swatch
  assert.match(jsx, /swatches\.activeValue !== undefined && swatches\.activeValue !== null && swatches\.activeValue === value/);
});

test('resolveContextMenuOpen preserves multi-selection when right-clicking a selected card and replaces otherwise', () => {
  const multi = new Set(['a', 'b', 'c']);
  assert.deepEqual(resolveContextMenuOpen('b', multi), { keepSelection: true, ids: ['a', 'b', 'c'] });
  assert.deepEqual(resolveContextMenuOpen('d', multi), { keepSelection: false, ids: ['d'] });
  assert.deepEqual(resolveContextMenuOpen('a', new Set(['a'])), { keepSelection: false, ids: ['a'] });
  assert.deepEqual(resolveContextMenuOpen('a', new Set()), { keepSelection: false, ids: ['a'] });
});

test('sharedNodeColor and recolorNodes handle uniform, mixed, and default colors across batches', () => {
  const nodes = [
    { id: 'a', color: '#fff8db' },
    { id: 'b', color: '#fff8db' },
    { id: 'c', color: '' },
    { id: 'd' },
  ];
  assert.equal(sharedNodeColor(resolveMenuTargetNodes('a', ['a', 'b'], nodes)), '#fff8db');
  assert.equal(sharedNodeColor(resolveMenuTargetNodes('c', ['c', 'd'], nodes)), '');
  assert.equal(sharedNodeColor(resolveMenuTargetNodes('a', ['a', 'c'], nodes)), null);
  assert.equal(sharedNodeColor([]), null);

  const recolored = recolorNodes(nodes, ['a', 'c'], '#e8f1ff');
  assert.equal(recolored.find((n) => n.id === 'a').color, '#e8f1ff');
  assert.equal(recolored.find((n) => n.id === 'b').color, '#fff8db');
  assert.equal(recolored.find((n) => n.id === 'c').color, '#e8f1ff');
  assert.equal(recolored.find((n) => n.id === 'd').color, undefined);

  const cleared = recolorNodes(recolored, ['a', 'c'], '');
  assert.equal(sharedNodeColor(resolveMenuTargetNodes('a', ['a', 'c'], cleared)), '');
});
