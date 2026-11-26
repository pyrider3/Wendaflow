export function viewportTransform(viewport){return `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`;}
// Existing overscan is retained. Only publish React snapshots when the mounted
// scene's safety margin is about to run out, or preview mode changes.
export function needsViewportSnapshot(previous,next,size,preview=false){
  if(preview && (previous.zoom<.54)!==(next.zoom<.54))return true;
  const oldZoom=Math.max(.02,previous.zoom),zoom=Math.max(.02,next.zoom),margin=420/oldZoom;
  return -next.x/zoom < -previous.x/oldZoom-margin || -next.y/zoom < -previous.y/oldZoom-margin ||
    (size.width-next.x)/zoom > (size.width-previous.x)/oldZoom+margin ||
    (size.height-next.y)/zoom > (size.height-previous.y)/oldZoom+margin;
}
export function connectionPath(kind,source,target,sourceSize,targetSize){
  if(kind==='parent'){
    // Attach to the sides that face each other so the line (and its arrowhead) never hides
    // under a card: parent left of child → right edge to left edge (the usual mind-map case),
    // parent right of child → left edge to right edge, stacked cards → bottom/top edges.
    // Between those layouts the two curves are blended by how far apart the cards are
    // horizontally, so dragging a card bends the line smoothly instead of snapping it.
    const sw=sourceSize.width,sh=sourceSize.height,tw=targetSize.width,th=targetSize.height;
    const forwardGap=target.x-(source.x+sw),backwardGap=source.x-(target.x+tw);
    const forward=forwardGap>=backwardGap,hGap=forward?forwardGap:backwardGap;
    const hx1=forward?source.x+sw:source.x,hy1=source.y+sh/2,hx2=forward?target.x:target.x+tw,hy2=target.y+th/2,mid=(hx1+hx2)/2;
    const horizontal=[hx1,hy1,mid,hy1,mid,hy2,hx2,hy2];
    const t=Math.min(1,Math.max(0,(hGap+36)/60)),w=t*t*(3-2*t);
    if(w===1)return `M ${hx1} ${hy1} C ${mid} ${hy1}, ${mid} ${hy2}, ${hx2} ${hy2}`;
    // Controls push out of each card by at least 28px, so even touching cards get a visible
    // S-bend and an arrowhead that points into the child.
    const below=target.y+th/2>=source.y+sh/2;
    const vx1=source.x+sw/2,vy1=below?source.y+sh:source.y,vx2=target.x+tw/2,vy2=below?target.y:target.y+th,k=(below?1:-1)*Math.max(28,Math.abs(vy2-vy1)/2);
    const vertical=[vx1,vy1,vx1,vy1+k,vx2,vy2-k,vx2,vy2];
    const q=vertical.map((v,i)=>v+(horizontal[i]-v)*w);
    return `M ${q[0]} ${q[1]} C ${q[2]} ${q[3]}, ${q[4]} ${q[5]}, ${q[6]} ${q[7]}`;
  }
  const x1=source.x+sourceSize.width/2,y1=source.y+sourceSize.height,x2=target.x+targetSize.width/2,y2=target.y,bend=Math.max(46,Math.abs(y2-y1)*.36);
  return `M ${x1} ${y1} C ${x1} ${y1+bend}, ${x2} ${y2-bend}, ${x2} ${y2}`;
}
export class ConnectionGeometry {
  constructor({getNode,getSize,requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}){
    Object.assign(this,{getNode,getSize,requestFrame,cancelFrame});this.byNode=new Map();this.edges=[];this.dirty=new Set();this.frame=null;
  }
  bind(svg){
    this.cancel();this.byNode.clear();this.edges=[];
    for(const path of svg?.querySelectorAll('.connection[data-connection-key], .connection-flow[data-connection-key]')||[]){const data=path.dataset;
      const edge={path,kind:data.connectionKind,sourceId:data.parentId||data.sourceId,targetId:data.childId||data.targetId};
      this.edges.push(edge);for(const id of [edge.sourceId,edge.targetId]){if(!this.byNode.has(id))this.byNode.set(id,new Set());this.byNode.get(id).add(edge);}
    }
    this.invalidate();this.flush();
  }
  invalidate(ids){
    if(ids){for(const id of ids)for(const edge of this.byNode.get(id)||[])this.dirty.add(edge);}else for(const edge of this.edges)this.dirty.add(edge);
    if(this.dirty.size && this.frame===null)this.frame=this.requestFrame(()=>{this.frame=null;this.flush();});
  }
  flush(){
    if(this.frame!==null){this.cancelFrame(this.frame);this.frame=null;}
    for(const edge of this.dirty){const source=this.getNode(edge.sourceId),target=this.getNode(edge.targetId);if(!source||!target)continue;
      const a=this.getSize(source.id)||{width:source.manualWidth||224,height:source.manualHeight||110},b=this.getSize(target.id)||{width:target.manualWidth||224,height:target.manualHeight||110};
      const d=connectionPath(edge.kind,source,target,a,b);if(edge.path.getAttribute('d')!==d)edge.path.setAttribute('d',d);
    }
    this.dirty.clear();
  }
  cancel(){if(this.frame!==null)this.cancelFrame(this.frame);this.frame=null;this.dirty.clear();}
}

// Input can arrive much faster than the display. Never queue old positions.
export class LatestFrame {
  constructor(write,request=callback=>requestAnimationFrame(callback),cancel=id=>cancelAnimationFrame(id)){
    Object.assign(this,{write,request,cancel});this.frame=null;this.pending=null;
  }
  enqueue(value){this.pending=value;if(this.frame===null)this.frame=this.request(()=>{this.frame=null;this.flush();});}
  flush(){if(this.frame!==null){this.cancel(this.frame);this.frame=null;}const value=this.pending;this.pending=null;if(value)this.write(value);}
  clear(){if(this.frame!==null)this.cancel(this.frame);this.frame=null;this.pending=null;}
}

// Preserve the former 0.2 easing at 60Hz, while compensating for dropped
// frames and high-refresh displays. Cap long background-tab gaps.
export function advanceViewport(current,target,elapsed=1000/60){
  const alpha=1-Math.pow(.8,Math.min(64,Math.max(1,elapsed))/(1000/60));
  return {x:current.x+(target.x-current.x)*alpha,y:current.y+(target.y-current.y)*alpha,zoom:current.zoom+(target.zoom-current.zoom)*alpha};
}
