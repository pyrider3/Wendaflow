export function thoughtIds(nodes, ids) {
  return new Set(nodes.filter(node => node.type === 'thought' && ids.has(node.id)).map(node => node.id));
}
export function boxThoughtIds(nodes, sizes, viewport, box) {
  const left=Math.min(box.startX,box.x), right=Math.max(box.startX,box.x);
  const top=Math.min(box.startY,box.y), bottom=Math.max(box.startY,box.y);
  return nodes.filter(node=>{
    if(node.type!=='thought')return false;
    const size=sizes.get(node.id)||{width:224,height:110};
    const x=viewport.x+node.x*viewport.zoom,y=viewport.y+node.y*viewport.zoom;
    return x>=left && y>=top && x+size.width*viewport.zoom<=right && y+size.height*viewport.zoom<=bottom;
  }).map(node=>node.id);
}
export function newThought(point,title,parentId,id) {
  return {id,type:'thought',author:'',model:null,title,content:'',prompt:null,parentId:parentId||null,x:point.x-112,y:point.y-55,status:'done',attachments:[]};
}

export function deletionBackups(nodes,ids) {
  return nodes.filter(node=>!ids.has(node.id)&&(ids.has(node.parentId)||(node.links||[]).some(id=>ids.has(id))||(node.relations||[]).some(r=>ids.has(r.targetId)))).map(node=>({id:node.id,parentId:node.parentId,links:node.links,relations:node.relations}));
}
export function removeNodeRecords(nodes,ids) {
  return nodes.filter(node=>!ids.has(node.id)).map(node=>({...node,parentId:ids.has(node.parentId)?null:node.parentId,relations:(node.relations||[]).filter(r=>!ids.has(r.targetId)),links:(node.links||[]).filter(id=>!ids.has(id))}));
}
