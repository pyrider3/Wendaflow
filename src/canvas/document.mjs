export const WDF_FORMAT = 'branchspace-wdf';
export function normalizeWdf(payload) {
  if (!payload || !['branchspace-wdf', 'wonderful-wdf'].includes(payload.format) || !Array.isArray(payload.nodes)) throw new Error('Invalid WDF format');
  if (payload.version != null && payload.version !== 1) throw new Error('Unsupported WDF version');
  const ids = new Set();
  const nodes = payload.nodes.map(n => {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error('Invalid or duplicate node');
    ids.add(n.id);
    for(const key of ['tags','requestHistory','contextExclusions','contextRelations'])if(n[key]!=null && !Array.isArray(n[key]))throw new Error('Invalid node array: '+key);
    if(n.tags && !n.tags.every(tag=>typeof tag==='string'))throw new Error('Invalid tags');
    if(n.attachments!=null && !Array.isArray(n.attachments))throw new Error('Invalid attachments');
    for(const a of n.attachments||[])if(!a || ['dataUrl','text','name','type'].some(key=>a[key]!=null && typeof a[key]!=='string'))throw new Error('Invalid attachment');
    if(n.execution!=null && (typeof n.execution!=='object' || (n.execution.events!=null && !Array.isArray(n.execution.events))))throw new Error('Invalid action execution');

    return {...n, type: ['thought','conversation','action'].includes(n.type) ? n.type : 'thought', title: typeof n.title === 'string' ? n.title : '', content: typeof n.content === 'string' ? n.content : '', parentId: n.parentId || null,
      attachments: Array.isArray(n.attachments) ? n.attachments.filter(a=>a && typeof a.id==='string') : [],
      relations: Array.isArray(n.relations) ? n.relations.filter(r=>r && typeof r.targetId==='string') : [], links: Array.isArray(n.links) ? n.links.filter(id=>typeof id==='string') : []};
  });
  const byId = new Map(nodes.map(n=>[n.id,n]));
  for (const n of nodes) {
    if (n.parentId && !ids.has(n.parentId)) n.parentId = null;
    n.links = n.links.filter(id=>ids.has(id) && id!==n.id);
    n.relations = n.relations.filter(r=>ids.has(r.targetId) && r.targetId!==n.id);
  }
  const done=new Set();
  for (const n of nodes) {
    const path=new Set();let cursor=n;
    while(cursor && !done.has(cursor.id)) {
      if(path.has(cursor.id)) throw new Error('Cyclic parent relationship');
      path.add(cursor.id);cursor=byId.get(cursor.parentId);
    }
    path.forEach(id=>done.add(id));
  }
  const v=payload.viewport;
  return {...payload, format:WDF_FORMAT, version:1, nodes, collapsedIds:(Array.isArray(payload.collapsedIds)?payload.collapsedIds:[]).filter(id=>ids.has(id)),
    viewport: v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom>0 ? {...v,zoom:Math.max(.02,Math.min(4,v.zoom))} : {x:20,y:20,zoom:.9}};
}
export function remapNodes(copied, idMap) {
  return copied.map(n=>({...n,id:idMap.get(n.id),parentId:idMap.get(n.parentId)||null,
    links:(n.links||[]).filter(id=>idMap.has(id)).map(id=>idMap.get(id)),
    relations:(n.relations||[]).filter(r=>idMap.has(r.targetId)).map((r,i)=>({...r,id:`${idMap.get(n.id)}-relation-${i}`,targetId:idMap.get(r.targetId)}))}));
}
