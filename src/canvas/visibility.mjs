// A camera snapshot always includes the existing 520px overscan. Interaction
// pins are explicit: keeping a parent must never mount its entire subtree.
export function cameraBounds(viewport,size){
  const zoom=Math.max(.02,viewport.zoom),margin=520/zoom;
  return {left:-viewport.x/zoom-margin,top:-viewport.y/zoom-margin,right:(size.width-viewport.x)/zoom+margin,bottom:(size.height-viewport.y)/zoom+margin};
}
export function cardsInView(nodes,sizes,bounds,pinned=new Set()){
  return nodes.filter(node=>{
    if(pinned.has(node.id))return true;
    const size=sizes.get(node.id)||{width:node.manualWidth||224,height:node.manualHeight||110};
    return node.x<=bounds.right&&node.x+size.width>=bounds.left&&node.y<=bounds.bottom&&node.y+size.height>=bounds.top;
  });
}
export function shallowEqual(a,b){
  if(Object.is(a,b))return true;
  if(!a||!b)return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.is(a[key],b[key]));
}
export function sameCardProps(a,b){
  return a.node===b.node&&a.runtime===b.runtime&&a.renderData===b.renderData&&a.uiLanguage===b.uiLanguage&&a.showThinking===b.showThinking&&a.tabIndex===b.tabIndex&&a.className===b.className&&shallowEqual(a.style,b.style)&&shallowEqual(a.view,b.view);
}

// A cubic lies inside its control-point hull. This conservative bounds check
// keeps crossing curves even when neither endpoint card is mounted.
export function connectionInView(kind,source,target,a,b,bounds){
  let xs,ys;
  if(kind==='parent'){
    xs=[source.x+a.width,target.x];ys=[source.y+a.height/2,target.y+b.height/2];
  }else{
    const y1=source.y+a.height,y2=target.y,bend=Math.max(46,Math.abs(y2-y1)*.36);
    xs=[source.x+a.width/2,target.x+b.width/2];ys=[y1,y1+bend,y2-bend,y2];
  }
  return Math.min(...xs)<=bounds.right&&Math.max(...xs)>=bounds.left&&Math.min(...ys)<=bounds.bottom&&Math.max(...ys)>=bounds.top;
}
