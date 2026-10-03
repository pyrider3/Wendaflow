// Segment tests include endpoints, collinear overlap and a small screen-space tolerance.
export function segmentHitsRect(a,b,rect) {
 let lo=0,hi=1;
 for(const [start,delta,min,max] of [[a.x,b.x-a.x,rect.left,rect.right],[a.y,b.y-a.y,rect.top,rect.bottom]]) {
  if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue;}
  const t1=(min-start)/delta,t2=(max-start)/delta;
  lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;
 }
 return true;
}
function pointDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function segmentsHit(a,b,c,d,tolerance=3) {
 const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 if(segmentHitsRect(a,b,{left:Math.min(c.x,d.x),right:Math.max(c.x,d.x),top:Math.min(c.y,d.y),bottom:Math.max(c.y,d.y)})&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return true;
 return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b))<=tolerance;
}
export function removeSliceRecords(nodes,ids,connections) {
 const parents=new Set(),relationKeys=new Map();
 for(const c of connections) {
  if(c.kind==='parent')parents.add(c.childId);
  else {if(!relationKeys.has(c.sourceId))relationKeys.set(c.sourceId,new Set());relationKeys.get(c.sourceId).add(`${c.targetId}:${c.type||'reference'}`);}
 }
 return nodes.filter(n=>!ids.has(n.id)).map(n=>{
  const keys=relationKeys.get(n.id);
  const parentId=ids.has(n.parentId)||parents.has(n.id)?null:n.parentId;
  const links=(n.links||[]).filter(id=>!ids.has(id)&&!keys?.has(`${id}:reference`));
  const relations=(n.relations||[]).filter(r=>!ids.has(r.targetId)&&!keys?.has(`${r.targetId}:${r.type||'reference'}`));
  return parentId===n.parentId&&links.length===(n.links||[]).length&&relations.length===(n.relations||[]).length?n:{...n,parentId,links,relations};
 });
}
export function sliceBackups(nodes,ids,connections) {
 const next=new Map(removeSliceRecords(nodes,ids,connections).map(n=>[n.id,n]));
 return nodes.filter(n=>!ids.has(n.id)&&next.get(n.id)!==n).map(n=>({id:n.id,parentId:n.parentId,links:n.links,relations:n.relations}));
}

// Flatten cubic curves in screen space once per gesture, avoiding SVG layout APIs on each move.
export function flattenCubic(points,tolerance=1.5) {
 const result=[points[0]];
 function visit([a,b,c,d],depth) {
  if(depth>=12||(pointDistance(b,a,d)<=tolerance&&pointDistance(c,a,d)<=tolerance)){result.push(d);return;}
  const mid=(p,q)=>({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
  visit([a,ab,abc,center],depth+1);visit([center,bcd,cd,d],depth+1);
 }
 visit(points,0);return result;
}
export function createSliceIndex(cards,links,cellSize=128,bounds) {
 const cells=new Map();
 const eachCell=(rect,fn)=>{if(bounds)rect={left:Math.max(rect.left,bounds.left-3),right:Math.min(rect.right,bounds.right+3),top:Math.max(rect.top,bounds.top-3),bottom:Math.min(rect.bottom,bounds.bottom+3)};if(rect.left>rect.right||rect.top>rect.bottom)return;for(let x=Math.floor(rect.left/cellSize);x<=Math.floor(rect.right/cellSize);x++)for(let y=Math.floor(rect.top/cellSize);y<=Math.floor(rect.bottom/cellSize);y++)fn(`${x}:${y}`);};
 const add=(item,rect)=>eachCell(rect,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);});
 for(const card of cards)add({...card,kind:'card'},card.rect);
 for(const link of links)for(let i=1;i<link.points.length;i++) {
  const a=link.points[i-1],b=link.points[i];
  add({kind:'line',link,a,b},{left:Math.min(a.x,b.x)-3,right:Math.max(a.x,b.x)+3,top:Math.min(a.y,b.y)-3,bottom:Math.max(a.y,b.y)+3});
 }
 return {query(a,b,ids,connections) {
  const candidates=new Set();
  eachCell({left:Math.min(a.x,b.x)-3,right:Math.max(a.x,b.x)+3,top:Math.min(a.y,b.y)-3,bottom:Math.max(a.y,b.y)+3},key=>{for(const item of cells.get(key)||[])candidates.add(item);});
  for(const item of candidates) {
   if(item.kind==='card'){if(!ids.has(item.id)&&segmentHitsRect(a,b,item.rect))ids.add(item.id);}
   else if(!connections.has(item.link.connection.key)&&segmentsHit(a,b,item.a,item.b))connections.set(item.link.connection.key,item.link.connection);
  }
  return candidates.size;
 }};
}
