// A card keeps one primary parent (tree layout, folding, context path) and may
// have extra parents: additional parent lines whose branches also feed its context.
export function parentIdsOf(node) {
  return [node?.parentId, ...(node?.extraParentIds || [])].filter(Boolean);
}

// True when `ancestorId` is `id` itself or reachable by walking up through any parent.
export function reachesUp(byId, id, ancestorId) {
  const seen = new Set(), stack = [id];
  while (stack.length) {
    const current = stack.pop();
    if (current === ancestorId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const node = byId.get(current);
    if (node) stack.push(...parentIdsOf(node));
  }
  return false;
}

function withExtras(node, ids) {
  const { extraParentIds, ...rest } = node;
  return ids.length ? { ...rest, extraParentIds: ids } : rest;
}

export function detachParent(node, parentId) {
  const extras = node.extraParentIds || [];
  if (parentId && parentId !== node.parentId) {
    return extras.includes(parentId) ? withExtras(node, extras.filter(id => id !== parentId)) : node;
  }
  if (!node.parentId) return node;
  return withExtras({ ...node, parentId: extras[0] || null }, extras.slice(1));
}

export function dropParents(node, ids) {
  let next = node;
  for (const id of parentIdsOf(node)) if (ids.has(id)) next = detachParent(next, id);
  return next;
}

export function addExtraParent(nodes, parentId, childId) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parent = byId.get(parentId), child = byId.get(childId);
  if (!parent || !child || parentId === childId) return nodes;
  if (reachesUp(byId, parentId, childId)) return nodes;
  if (parentIdsOf(child).includes(parentId)) return nodes;
  return nodes.map(n => n.id !== childId ? n : n.parentId
    ? { ...n, extraParentIds: [...(n.extraParentIds || []), parentId] }
    : { ...n, parentId });
}
