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
  const seen=new Set();let cursor=source;
  while(cursor){if(cursor.id===targetId || seen.has(cursor.id))return 'cycle';seen.add(cursor.id);cursor=map.get(cursor.parentId);}
  if(target.parentId===sourceId)return 'connected';
  return target.parentId?'reparent':'connect';
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
