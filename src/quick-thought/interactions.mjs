import {parentIdsOf,reachesUp} from '../canvas/parents.mjs';
export const DRAG_THRESHOLD = 5;
export function crossedDragThreshold(drag,point) {
  return drag.started || Math.hypot(point.clientX-drag.startX,point.clientY-drag.startY)>=DRAG_THRESHOLD;
}
export function combineSelection(base,hits,mode='replace') {
  if(mode==='replace')return new Set(hits);
  const next=new Set(base||[]);
  for(const id of hits)if(mode==='subtract')next.delete(id);else next.add(id);
  return next;
}
export function connectionIntent(nodes,sourceId,targetId) {
  if(!targetId)return 'empty';
  const map=new Map(nodes.map(n=>[n.id,n])), source=map.get(sourceId),target=map.get(targetId);
  if(!source || !target)return 'invalid';
  if(sourceId===targetId)return 'self';
  if(reachesUp(map,sourceId,targetId))return 'cycle';
  if(parentIdsOf(target).includes(sourceId))return 'connected';
  return target.parentId?'reparent':'connect';
}
export function updateRelationDragState(current,point,target,nodes,altKey=false) {
  const targetNode=nodes.find(n=>n.id===target);
  const validTarget=Boolean(targetNode && targetNode.type!=='group');
  const effectiveTarget=validTarget?target:null;
  const intent=current.quick&&!current.reference?connectionIntent(nodes,current.sourceId,effectiveTarget):'connect';
  const invalid=current.quick && ['cycle','self','invalid'].includes(intent);
  return {
    ...current,
    intent,
    extra:intent==='reparent'&&!altKey,
    invalidTargetId:invalid?effectiveTarget:null,
    moved:current.moved||Math.hypot(point.clientX-current.startX,point.clientY-current.startY)>DRAG_THRESHOLD,
    x:point.clientX,
    y:point.clientY,
    targetId:invalid||effectiveTarget===current.sourceId||!validTarget?null:effectiveTarget,
  };
}
export function relativeIdeaPoint(node,kind,nodes,sizes) {
  const size=sizes.get(node.id)||{width:95,height:47};
  const x=kind==='child'?node.x+size.width+80:node.x;
  let y=kind==='child'?node.y:node.y+size.height+28;
  const occupied=nodes.filter(n=>n.x<x+160 && n.x+(sizes.get(n.id)?.width||95)>x).sort((a,b)=>a.y-b.y);
  for(const n of occupied){const h=sizes.get(n.id)?.height||47;if(y+47>n.y && y<n.y+h)y=n.y+h+28;}
  return {x:x+14,y:y+10};
}
export function directionalNeighbor(node,direction,nodes,sizes) {
  const center=n=>({x:n.x+(sizes.get(n.id)?.width||95)/2,y:n.y+(sizes.get(n.id)?.height||47)/2});
  const origin=center(node),horizontal=['ArrowLeft','ArrowRight'].includes(direction),sign=['ArrowLeft','ArrowUp'].includes(direction)?-1:1;
  let winner=null,best=Infinity;
  for(const n of nodes){if(n.id===node.id)continue;const p=center(n),primary=(horizontal?p.x-origin.x:p.y-origin.y)*sign,cross=Math.abs(horizontal?p.y-origin.y:p.x-origin.x);if(primary<=0)continue;const score=primary+cross*2.5;if(score<best){best=score;winner=n;}}
  return winner;
}

const TAB_PROTECTED = '.inspector, .ix, .settings-panel, .canvas-overview, .canvas-context-menu, .search-panel, .library-panel, .merge-workbench, .chip-pop, .parallel-pop, .suggest-menu, .relation-popover, .relation-editor-popover, .inline-node-editor, .quick-thought-editor, .group-toolbar, .group-title-input, [role="dialog"], [role="menu"], [role="listbox"]';

// Decides what a plain Tab press should do on the canvas: toggle quick thinking, create a child idea,
// or leave native browser focus navigation alone (inside dialogs, menus, inspector, or non-composer inputs).
export function tabAction(target, { hasBlockingOverlay = false, quickThought = false, selectedIsThought = false } = {}) {
  if (hasBlockingOverlay) return null;
  const el = target && typeof target.closest === 'function' ? target : null;
  if (el?.closest(TAB_PROTECTED)) return null;
  if (el?.closest('textarea, input, select, [contenteditable="true"]')) {
    return el.closest('.composer') ? 'toggle' : null;
  }
  if (quickThought && selectedIsThought && !el?.closest('.topbar')) return 'child';
  return 'toggle';
}

// Updates card selection classes directly on the DOM during marquee drag so sweeping across dozens
// of cards never triggers full React re-renders on every pointer frame.
export function applyMarqueeDomSelection(preview, nextIds, badgeEl = null) {
  if (!preview) return;
  const prev = preview.ids || new Set();
  const els = preview.els;
  const nextPrimary = nextIds.size > 1 ? [...nextIds].at(-1) || null : null;
  if (els) {
    for (const id of prev) {
      if (!nextIds.has(id)) els.get(id)?.classList.remove('selected', 'primary-selected');
    }
    for (const id of nextIds) {
      if (!prev.has(id)) els.get(id)?.classList.add('selected');
    }
    if (preview.primary && preview.primary !== nextPrimary) {
      els.get(preview.primary)?.classList.remove('primary-selected');
    }
    if (nextPrimary && nextPrimary !== preview.primary) {
      els.get(nextPrimary)?.classList.add('primary-selected');
    }
  }
  preview.ids = nextIds;
  preview.primary = nextPrimary;
  const badge = badgeEl || preview.badge;
  if (badge) {
    if (nextIds.size > 1) {
      badge.textContent = preview.formatCount ? preview.formatCount(nextIds.size) : String(nextIds.size);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
}
