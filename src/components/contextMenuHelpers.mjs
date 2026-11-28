// Pure helpers for canvas context-menu targeting, multi-selection preservation,
// and batch color updates shared by normal mode and quick-thinking mode.

/**
 * Decide whether right-clicking `nodeId` should preserve the active multi-selection
 * or switch selection to just `nodeId`.
 */
export function resolveContextMenuOpen(nodeId, selectedIds) {
  if (selectedIds && typeof selectedIds.has === 'function' && selectedIds.has(nodeId) && selectedIds.size > 1) {
    return { keepSelection: true, ids: [...selectedIds] };
  }
  return { keepSelection: false, ids: nodeId ? [nodeId] : [] };
}

/**
 * Resolve live node objects targeted by a context menu.
 */
export function resolveMenuTargetNodes(nodeId, menuIds, nodes = []) {
  const rawIds = Array.isArray(menuIds) && menuIds.length ? menuIds : (nodeId ? [nodeId] : []);
  if (!rawIds.length) return [];
  const wanted = new Set(rawIds);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = [];
  for (const id of wanted) {
    const found = byId.get(id);
    if (found) ordered.push(found);
  }
  return ordered;
}

/**
 * Return the common color string when every targeted node shares the same color
 * (including `""` for default), or `null` when colors are mixed or empty.
 */
export function sharedNodeColor(targetNodes = []) {
  if (!targetNodes.length) return null;
  const first = targetNodes[0]?.color || '';
  return targetNodes.every((node) => (node?.color || '') === first) ? first : null;
}

/**
 * Apply `color` to every node whose id is in `targetIds`.
 */
export function recolorNodes(nodes = [], targetIds = [], color = '') {
  const idSet = targetIds instanceof Set ? targetIds : new Set(targetIds);
  if (!idSet.size) return nodes;
  return nodes.map((node) => (idSet.has(node.id) ? { ...node, color } : node));
}
