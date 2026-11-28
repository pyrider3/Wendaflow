// Spatial group frames ("Section" / 分组框) for organizing cards on the canvas,
// inspired by Project Graph's Section mechanics:
// - Collapse into a compact double-bordered pill (with dashed expanded preview on select)
// - Zoom-out big covered title for bird's-eye navigation
// - Locking to turn the frame + contents into a single rigid movable block
// - Border styles (solid / dashed / none) and fill modes (full / title-only)
// - Dynamic auto-fit wrapping, smart tree naming, and card <-> section conversions

export const DEFAULT_GROUP_WIDTH = 360;
export const DEFAULT_GROUP_HEIGHT = 240;
export const MIN_GROUP_WIDTH = 180;
export const MIN_GROUP_HEIGHT = 120;
export const MAX_GROUP_WIDTH = 4800;
export const MAX_GROUP_HEIGHT = 3600;
export const GROUP_HEADER_HEIGHT = 38;
export const COLLAPSED_GROUP_HEIGHT = 54;
export const BIG_TITLE_ZOOM_THRESHOLD = 0.45;
export const BIG_TITLE_VIEW_RATIO = 0.85;
export const GROUP_BORDER_STYLES = ['solid', 'dashed', 'none'];
export const GROUP_FILL_MODES = ['full', 'title'];

export function isGroupNode(node) {
  return node?.type === 'group';
}

// Group nodes always own authoritative expanded bounds in manualWidth/manualHeight so
// collapsing a group's DOM element to a compact pill never corrupts spatial containment.
export function nodeRect(node, sizes) {
  if (isGroupNode(node)) {
    const width = node.manualWidth || DEFAULT_GROUP_WIDTH;
    const height = node.manualHeight || DEFAULT_GROUP_HEIGHT;
    return { x: node.x, y: node.y, width, height, right: node.x + width, bottom: node.y + height };
  }
  const measured = sizes?.get?.(node.id);
  const width = measured?.width || node.manualWidth || 224;
  const height = measured?.height || node.manualHeight || 110;
  return { x: node.x, y: node.y, width, height, right: node.x + width, bottom: node.y + height };
}

function estimateTitleWidth(title) {
  let width = 0;
  for (const ch of String(title || '')) {
    width += /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 16 : 9.5;
  }
  return width;
}

// Project Graph style collapsed pill centered over the section's expanded bounds.
export function collapsedGroupRect(group) {
  const expanded = nodeRect(group);
  const titleWidth = estimateTitleWidth(group.title || 'Group');
  const width = Math.round(Math.max(176, Math.min(360, titleWidth + 104)));
  const height = COLLAPSED_GROUP_HEIGHT;
  const x = Math.round(expanded.x + (expanded.width - width) / 2);
  const y = Math.round(expanded.y + (expanded.height - height) / 2);
  return { x, y, width, height, right: x + width, bottom: y + height, expanded };
}

export function visualGroupRect(node, sizes) {
  if (isGroupNode(node) && node.collapsed) return collapsedGroupRect(node);
  return nodeRect(node, sizes);
}

export function rectContainsCenter(outer, inner) {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return cx >= outer.x && cx <= outer.right && cy >= outer.y && cy <= outer.bottom;
}

// Returns every node id geometrically contained inside `group` (including nested smaller groups).
export function containedNodeIds(group, nodes, sizes) {
  if (!isGroupNode(group)) return [];
  const outer = nodeRect(group, sizes);
  const outerArea = outer.width * outer.height;
  const direct = [];
  for (const item of nodes) {
    if (!item || item.id === group.id) continue;
    const inner = nodeRect(item, sizes);
    if (isGroupNode(item) && inner.width * inner.height >= outerArea) continue;
    if (rectContainsCenter(outer, inner)) direct.push(item);
  }
  const result = new Set(direct.map((item) => item.id));
  const queue = direct.filter(isGroupNode);
  while (queue.length) {
    const sub = queue.shift();
    const subRect = nodeRect(sub, sizes);
    const subArea = subRect.width * subRect.height;
    for (const item of nodes) {
      if (!item || item.id === group.id || result.has(item.id)) continue;
      const inner = nodeRect(item, sizes);
      if (isGroupNode(item) && inner.width * inner.height >= subArea) continue;
      if (rectContainsCenter(subRect, inner)) {
        result.add(item.id);
        if (isGroupNode(item)) queue.push(item);
      }
    }
  }
  return [...result];
}

// Counts non-group cards contained inside `group` for the header badge & Inspector.
export function containedCardCount(group, nodes, sizes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return containedNodeIds(group, nodes, sizes).filter((id) => !isGroupNode(byId.get(id))).length;
}

// Nodes hidden because they sit inside at least one collapsed group frame.
// Derived purely from each group's `collapsed` flag, so unfolding an outer group
// automatically preserves the collapsed state of any nested subgroup.
export function hiddenByCollapsedGroups(nodes, sizes) {
  const hidden = new Set();
  for (const node of nodes) {
    if (!isGroupNode(node) || !node.collapsed) continue;
    for (const id of containedNodeIds(node, nodes, sizes)) hidden.add(id);
  }
  return hidden;
}

// All expanded groups containing `nodeId`, ordered innermost (smallest area) first.
export function enclosingGroupsFor(nodeId, nodes, sizes, { includeCollapsed = false } = {}) {
  const target = nodes.find((node) => node?.id === nodeId);
  if (!target) return [];
  const targetRect = nodeRect(target, sizes);
  const targetArea = targetRect.width * targetRect.height;
  const matches = [];
  for (const node of nodes) {
    if (!isGroupNode(node) || node.id === nodeId) continue;
    if (!includeCollapsed && node.collapsed) continue;
    const rect = nodeRect(node, sizes);
    const area = rect.width * rect.height;
    if (isGroupNode(target) && area <= targetArea) continue;
    if (rectContainsCenter(rect, targetRect)) matches.push({ node, area });
  }
  matches.sort((a, b) => a.area - b.area);
  return matches.map((item) => item.node);
}

// Project Graph's outermost locked ancestor section: interactions inside a locked group
// redirect to this outermost locked container so contents stay protected as one rigid block.
export function outermostLockedGroupFor(nodeId, nodes, sizes) {
  const owners = enclosingGroupsFor(nodeId, nodes, sizes, { includeCollapsed: true }).filter((group) => group.locked);
  return owners.length ? owners[owners.length - 1] : null;
}

export function isLockedInsideGroup(nodeId, nodes, sizes) {
  return Boolean(outermostLockedGroupFor(nodeId, nodes, sizes));
}

// Project Graph's zoom-out big covered title condition (SectionMethods.isSectionBigTitleActive).
// Dashed and borderless frames stay translucent and never enter opaque big-title mode.
export function isBigTitleActive(group, viewport, viewSize) {
  if (!isGroupNode(group) || group.collapsed) return false;
  const border = group.borderStyle || 'solid';
  if (border === 'dashed' || border === 'none') return false;
  const zoom = viewport?.zoom ?? 1;
  if (zoom > BIG_TITLE_ZOOM_THRESHOLD) return false;
  const rect = nodeRect(group);
  const sectionMax = Math.max(rect.width, rect.height);
  const viewMax = Math.max(viewSize?.width || 1280, viewSize?.height || 720) / Math.max(0.02, zoom);
  return sectionMax < viewMax * BIG_TITLE_VIEW_RATIO;
}

export function nextBorderStyle(current = 'solid') {
  const index = GROUP_BORDER_STYLES.indexOf(current || 'solid');
  return GROUP_BORDER_STYLES[(index + 1) % GROUP_BORDER_STYLES.length];
}

// When dragging one or more group frames, also drag every card/subgroup inside them
// unless `moveFrameOnly` (Alt key) is held on an expanded group. Collapsed groups
// always carry their hidden contents so unfolding restores them at the new location.
export function expandDragIdsWithGroups(dragIds, nodes, sizes, { moveFrameOnly = false } = {}) {
  const ids = new Set(dragIds);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const id of [...ids]) {
    const node = byId.get(id);
    if (!isGroupNode(node)) continue;
    if (moveFrameOnly && !node.collapsed) continue;
    for (const childId of containedNodeIds(node, nodes, sizes)) ids.add(childId);
  }
  return [...ids];
}

// Wraps a set of nodes into a comfortable frame with room for the top title bar,
// or creates a centered blank group frame when no nodes are selected.
export function groupBoundsForNodes(
  targets,
  sizes,
  { padX = 32, padTop = 52, padBottom = 32, minWidth = 240, minHeight = 150, fallbackCenter = { x: 260, y: 200 } } = {},
) {
  if (!targets?.length) {
    return {
      x: Math.round(fallbackCenter.x - DEFAULT_GROUP_WIDTH / 2),
      y: Math.round(fallbackCenter.y - DEFAULT_GROUP_HEIGHT / 2),
      manualWidth: DEFAULT_GROUP_WIDTH,
      manualHeight: DEFAULT_GROUP_HEIGHT,
    };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of targets) {
    const rect = visualGroupRect(item, sizes);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  }
  const width = Math.min(MAX_GROUP_WIDTH, Math.max(minWidth, Math.round(maxX - minX + padX * 2)));
  const height = Math.min(MAX_GROUP_HEIGHT, Math.max(minHeight, Math.round(maxY - minY + padTop + padBottom)));
  return {
    x: Math.round(minX - padX),
    y: Math.round(minY - padTop),
    manualWidth: width,
    manualHeight: height,
  };
}

export function nextGroupTitle(nodes, prefix = '分组') {
  const existing = new Set(nodes.filter(isGroupNode).map((node) => String(node.title || '').trim()));
  let index = 1;
  while (existing.has(`${prefix} ${index}`) || existing.has(`${prefix}_${index}`)) index += 1;
  return `${prefix} ${index}`;
}

// Project Graph's smart section naming: if packed cards share a single root card,
// adopt its title (truncated cleanly), otherwise fall back to sequential naming.
export function smartGroupTitle(targets, allNodes, prefix = '分组') {
  const cards = (targets || []).filter((item) => item && !isGroupNode(item));
  if (cards.length) {
    const idSet = new Set(cards.map((item) => item.id));
    const roots = cards.filter((item) => !item.parentId || !idSet.has(item.parentId));
    if (roots.length === 1) {
      const raw = String(roots[0].title || roots[0].prompt || '').replace(/\s+/g, ' ').trim();
      if (raw) {
        const chars = [...raw];
        return chars.length > 14 ? `${chars.slice(0, 14).join('')}…` : raw;
      }
    }
  }
  return nextGroupTitle(allNodes, prefix);
}

export function createGroupNode({
  id,
  title,
  x,
  y,
  manualWidth,
  manualHeight,
  color = '',
  borderStyle = 'solid',
  fillMode = 'full',
  collapsed = false,
  locked = false,
  autoFit = false,
}) {
  return {
    id,
    type: 'group',
    parentId: null,
    author: '',
    model: null,
    title,
    content: '',
    prompt: null,
    x,
    y,
    manualWidth,
    manualHeight,
    ...(color ? { color } : {}),
    ...(borderStyle && borderStyle !== 'solid' ? { borderStyle } : {}),
    ...(fillMode && fillMode !== 'full' ? { fillMode } : {}),
    ...(collapsed ? { collapsed: true } : {}),
    ...(locked ? { locked: true } : {}),
    ...(autoFit ? { autoFit: true } : {}),
    status: 'done',
    attachments: [],
    relations: [],
    links: [],
  };
}

// Eight-handle resize supporting n/s/e/w/ne/nw/se/sw (and legacy 'both'/'x'/'y' axes).
export function resizeGroupRect(
  origin,
  handle,
  dx,
  dy,
  { minWidth = MIN_GROUP_WIDTH, minHeight = MIN_GROUP_HEIGHT, maxWidth = MAX_GROUP_WIDTH, maxHeight = MAX_GROUP_HEIGHT } = {},
) {
  const mode = handle === 'both' ? 'se' : handle === 'x' ? 'e' : handle === 'y' ? 's' : handle;
  let { x, y, width, height } = origin;
  if (mode.includes('e')) {
    width = Math.max(minWidth, Math.min(maxWidth, width + dx));
  }
  if (mode.includes('s')) {
    height = Math.max(minHeight, Math.min(maxHeight, height + dy));
  }
  if (mode.includes('w')) {
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, width - dx));
    x += width - nextWidth;
    width = nextWidth;
  }
  if (mode.includes('n')) {
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, height - dy));
    y += height - nextHeight;
    height = nextHeight;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    manualWidth: Math.round(width),
    manualHeight: Math.round(height),
  };
}

// Captures expanded unlocked autoFit groups that own at least one dragged node (innermost first),
// so moving a card smoothly stretches/shrinks its autoFit section(s) in real time.
export function captureAutoFitOwners(dragIds, nodes, sizes) {
  const dragSet = new Set(dragIds);
  const candidates = [];
  for (const node of nodes) {
    if (!isGroupNode(node) || !node.autoFit || node.collapsed || node.locked || dragSet.has(node.id)) continue;
    const inside = containedNodeIds(node, nodes, sizes);
    if (!inside.some((id) => dragSet.has(id))) continue;
    const rect = nodeRect(node, sizes);
    candidates.push({ groupId: node.id, memberIds: inside, area: rect.width * rect.height });
  }
  candidates.sort((a, b) => a.area - b.area);
  return candidates.map(({ groupId, memberIds }) => ({ groupId, memberIds }));
}

// Applies live auto-fit bounds to captured owner groups (innermost first so nested groups cascade).
export function applyAutoFitToNodes(nodes, sizes, owners) {
  if (!owners?.length) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const patches = new Map();
  for (const { groupId, memberIds } of owners) {
    const group = byId.get(groupId);
    if (!group || !isGroupNode(group) || group.collapsed || group.locked) continue;
    const members = memberIds.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) continue;
    const bounds = groupBoundsForNodes(members, sizes);
    const updated = { ...group, ...bounds };
    byId.set(groupId, updated);
    patches.set(groupId, updated);
  }
  if (!patches.size) return nodes;
  return nodes.map((node) => patches.get(node.id) || node);
}

// Drop-time auto-fit: if cards were dropped into an expanded unlocked autoFit group,
// refit that group (innermost first) around everything currently inside it.
export function refitAutoFitGroupsForDrop(nodes, sizes, movedIds) {
  const movedSet = new Set(movedIds || []);
  if (!movedSet.size) return nodes;
  const groups = nodes
    .filter((node) => isGroupNode(node) && node.autoFit && !node.collapsed && !node.locked && !movedSet.has(node.id))
    .map((group) => ({ group, area: nodeRect(group, sizes).width * nodeRect(group, sizes).height }))
    .sort((a, b) => a.area - b.area);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const patches = new Map();
  for (const { group } of groups) {
    const liveNodes = [...byId.values()];
    const inside = containedNodeIds(byId.get(group.id), liveNodes, sizes);
    if (!inside.some((id) => movedSet.has(id))) continue;
    const members = inside.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) continue;
    const updated = { ...byId.get(group.id), ...groupBoundsForNodes(members, sizes) };
    byId.set(group.id, updated);
    patches.set(group.id, updated);
  }
  if (!patches.size) return nodes;
  return nodes.map((node) => patches.get(node.id) || node);
}

// Moves a card cleanly outside its enclosing group frame (Project Graph's goOutSection).
export function computeDetachPosition(card, group, sizes, gap = 36) {
  const cardRect = nodeRect(card, sizes);
  const groupRect = nodeRect(group, sizes);
  return {
    x: Math.round(groupRect.right + gap),
    y: Math.round(Math.max(groupRect.y, cardRect.y)),
  };
}

// Collects `rootId` plus all descendant cards reachable through `parentId`.
export function collectSubtreeIds(rootId, nodes) {
  const childrenMap = new Map();
  for (const node of nodes) {
    if (!node || isGroupNode(node) || !node.parentId) continue;
    if (!childrenMap.has(node.parentId)) childrenMap.set(node.parentId, []);
    childrenMap.get(node.parentId).push(node.id);
  }
  const visited = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const childId of childrenMap.get(id) || []) queue.push(childId);
  }
  return [...visited];
}

// Marquee hit test: regular cards (and collapsed or locked groups) select on any overlap;
// open unlocked group frames select only when fully enclosed OR when touching the header strip,
// so dragging a marquee inside an open group never accidentally grabs the frame itself.
export function marqueeHitsScreenRect(node, rect, box, zoom = 1) {
  const left = Math.min(box.startX, box.x);
  const right = Math.max(box.startX, box.x);
  const top = Math.min(box.startY, box.y);
  const bottom = Math.max(box.startY, box.y);
  if (!isGroupNode(node) || node.collapsed || node.locked) {
    return rect.left <= right && rect.right >= left && rect.top <= bottom && rect.bottom >= top;
  }
  const fullyEnclosed = left <= rect.left && right >= rect.right && top <= rect.top && bottom >= rect.bottom;
  if (fullyEnclosed) return true;
  const headerBottom = Math.min(rect.bottom, rect.top + Math.max(24, GROUP_HEADER_HEIGHT * zoom));
  return rect.left <= right && rect.right >= left && rect.top <= bottom && headerBottom >= top;
}

// Groups render behind cards; larger outer groups render behind smaller nested groups.
export function sortNodesForRender(nodes, sizes) {
  const groups = [];
  const cards = [];
  for (const node of nodes) {
    if (isGroupNode(node)) groups.push(node);
    else cards.push(node);
  }
  groups.sort((a, b) => {
    const ra = nodeRect(a, sizes);
    const rb = nodeRect(b, sizes);
    return rb.width * rb.height - ra.width * ra.height;
  });
  return [...groups, ...cards];
}

// Captures each group's member card ids before an auto-layout pass, then refits
// non-empty groups snugly around their relocated cards (inner groups before outer).
export function captureGroupMembers(nodes, sizes) {
  const members = new Map();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (!isGroupNode(node)) continue;
    const ids = containedNodeIds(node, nodes, sizes).filter((id) => !isGroupNode(byId.get(id)));
    if (ids.length) members.set(node.id, ids);
  }
  return members;
}

export function refitGroupsAfterLayout(nodes, positions, sizeFor, groupMembers) {
  if (!groupMembers?.size) return new Map();
  const nextPos = new Map(positions);
  const cardRect = (node) => {
    const pos = nextPos.get(node.id) || { x: node.x, y: node.y };
    const size = sizeFor(node);
    return { x: pos.x, y: pos.y, width: size.width, height: size.height, right: pos.x + size.width, bottom: pos.y + size.height };
  };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const updates = new Map();
  const groups = nodes.filter((node) => isGroupNode(node) && groupMembers.has(node.id))
    .sort((a, b) => (groupMembers.get(a.id)?.length || 0) - (groupMembers.get(b.id)?.length || 0));
  for (const group of groups) {
    const memberNodes = (groupMembers.get(group.id) || []).map((id) => byId.get(id)).filter(Boolean);
    if (!memberNodes.length) continue;
    const tempSizes = new Map();
    const placed = memberNodes.map((item) => {
      const rect = cardRect(item);
      tempSizes.set(item.id, { width: rect.width, height: rect.height });
      return { ...item, x: rect.x, y: rect.y };
    });
    updates.set(group.id, groupBoundsForNodes(placed, tempSizes));
  }
  return updates;
}
