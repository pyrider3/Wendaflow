// Left-to-right tidy tree layout for the whole canvas.
//
// Every card sits in the column of its depth (columns are as wide as their widest card), and every subtree
// gets its own vertical band: children are stacked in their current top-to-bottom order and the parent is
// centred on them, so a card is always next to its own children and lines never cross between subtrees.
// Separate trees are stacked one under another in their current order. Only the primary parent shapes the
// tree; extra parents are just extra lines. Cycles and missing parents are tolerated.
//
// nodes: [{ id, parentId, x, y }]; sizeOf(node) -> { width, height }. Returns Map(id -> { x, y }).
export function tidyLayout(nodes, sizeOf, { left = 100, top = 110, columnGap = 96, rowGap = 28, treeGap = 72 } = {}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  const roots = [];
  for (const node of nodes) {
    const parent = node.parentId && node.parentId !== node.id ? byId.get(node.parentId) : null;
    if (parent) children.get(parent.id).push(node); else roots.push(node);
  }
  // A cycle has no root: break it at its top-most card.
  const reached = new Set();
  const mark = (node) => { const stack = [node]; while (stack.length) { const item = stack.pop(); if (reached.has(item.id)) continue; reached.add(item.id); stack.push(...children.get(item.id)); } };
  roots.forEach(mark);
  for (const node of [...nodes].sort((a, b) => a.y - b.y)) if (!reached.has(node.id)) { roots.push(node); mark(node); }
  const order = (list) => list.sort((a, b) => a.y - b.y || a.x - b.x);
  order(roots);
  for (const list of children.values()) order(list);

  // Depth by walking down from the roots (each card once).
  const depth = new Map(), seen = new Set();
  const walk = (node, d) => { if (seen.has(node.id)) return; seen.add(node.id); depth.set(node.id, d); for (const child of children.get(node.id)) walk(child, d + 1); };
  roots.forEach((root) => walk(root, 0));
  const columnWidth = new Map();
  for (const node of nodes) { const d = depth.get(node.id) ?? 0; columnWidth.set(d, Math.max(columnWidth.get(d) || 0, sizeOf(node).width)); }
  const columnX = new Map();
  let x = left;
  for (const d of [...columnWidth.keys()].sort((a, b) => a - b)) { columnX.set(d, x); x += columnWidth.get(d) + columnGap; }

  // Band height of each subtree, then place top-down.
  const band = new Map();
  const measure = (node, guard = new Set()) => {
    if (band.has(node.id)) return band.get(node.id);
    if (guard.has(node.id)) return sizeOf(node).height;
    guard.add(node.id);
    const kids = children.get(node.id).filter((child) => depth.get(child.id) === (depth.get(node.id) ?? 0) + 1);
    const kidsHeight = kids.reduce((sum, child, index) => sum + measure(child, guard) + (index ? rowGap : 0), 0);
    const height = Math.max(sizeOf(node).height, kidsHeight);
    band.set(node.id, height);
    return height;
  };
  const positions = new Map();
  const place = (node, bandTop) => {
    const d = depth.get(node.id) ?? 0, own = sizeOf(node).height, total = band.get(node.id);
    const kids = children.get(node.id).filter((child) => depth.get(child.id) === d + 1 && !positions.has(child.id));
    const kidsHeight = kids.reduce((sum, child, index) => sum + band.get(child.id) + (index ? rowGap : 0), 0);
    positions.set(node.id, { x: columnX.get(d), y: Math.round(bandTop + (total - own) / 2) });
    let y = bandTop + (total - kidsHeight) / 2;
    for (const child of kids) { place(child, y); y += band.get(child.id) + rowGap; }
  };
  let y = top;
  for (const root of roots) { measure(root); place(root, y); y += band.get(root.id) + treeGap; }
  return positions;
}
