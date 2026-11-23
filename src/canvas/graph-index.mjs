// One linear index per document update; no maps or subtree walks per card.
function sameExtraParents(a, b) {
  if (a === b) return true;
  if (!a?.length && !b?.length) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function makeGraphApi(nodes, byId, children, descendantCount, start, end, order) {
  function isDescendant(id,parent){return start.has(id)&&start.has(parent)&&start.get(parent)<start.get(id)&&start.get(id)<end.get(parent);}
  function ancestors(id){const path=[],seen=new Set();let cursor=byId.get(id);while(cursor&&!seen.has(cursor.id)){path.push(cursor);seen.add(cursor.id);cursor=byId.get(cursor.parentId);}return path.reverse();}
  function ancestorIds(ids){const result=new Set(),stack=[...ids];while(stack.length){const node=byId.get(stack.pop());if(!node||result.has(node.id))continue;result.add(node.id);if(node.parentId)stack.push(node.parentId);if(node.extraParentIds)stack.push(...node.extraParentIds);}return result;}
  function visibleNodes(collapsed){
    if(!collapsed.size)return nodes;
    const delta=new Int32Array(order.length+1);
    for(const id of collapsed)if(start.has(id)){delta[start.get(id)+1]++;delta[end.get(id)]--;}
    const hidden=new Set();let depth=0;for(let i=0;i<order.length;i++){depth+=delta[i];if(depth>0)hidden.add(order[i]);}
    return nodes.filter(node=>!hidden.has(node.id));
  }
  return {byId,children,descendantCount,isDescendant,ancestors,ancestorIds,visibleNodes,_nodes:nodes,_start:start,_end:end,_order:order};
}

export function createGraphIndex(nodes) {
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const children=new Map(nodes.map(node=>[node.id,[]]));
  const roots=[];
  for(const node of nodes){if(byId.has(node.parentId)&&node.parentId!==node.id)children.get(node.parentId).push(node.id);else roots.push(node.id);}
  const start=new Map(),end=new Map(),order=[];
  // Iterative DFS also handles very deep documents and malformed cached cycles.
  for(const root of [...roots,...byId.keys()]){
    if(start.has(root))continue;
    const stack=[{id:root,exit:false}];
    while(stack.length){const item=stack.pop();if(item.exit){end.set(item.id,order.length);continue;}if(start.has(item.id))continue;
      start.set(item.id,order.length);order.push(item.id);stack.push({id:item.id,exit:true});
      const list=children.get(item.id)||[];for(let i=list.length-1;i>=0;i--)if(!start.has(list[i]))stack.push({id:list[i],exit:false});
    }
  }
  const descendantCount=new Map(order.map(id=>[id,end.get(id)-start.get(id)-1]));
  return makeGraphApi(nodes, byId, children, descendantCount, start, end, order);
}

// Reuse the DFS topology index when only non-structural fields (position, content, status) changed.
export function updateGraphIndex(previous, nodes) {
  const prevNodes = previous?._nodes;
  if (prevNodes && prevNodes.length === nodes.length) {
    let sameTopology = true;
    for (let i = 0; i < nodes.length; i++) {
      const a = prevNodes[i], b = nodes[i];
      if (a === b) continue;
      if (a.id !== b.id || (a.parentId || null) !== (b.parentId || null) || !sameExtraParents(a.extraParentIds, b.extraParentIds)) {
        sameTopology = false;
        break;
      }
    }
    if (sameTopology) {
      const byId = new Map();
      for (let i = 0; i < nodes.length; i++) byId.set(nodes[i].id, nodes[i]);
      return makeGraphApi(nodes, byId, previous.children, previous.descendantCount, previous._start, previous._end, previous._order);
    }
  }
  return createGraphIndex(nodes);
}
