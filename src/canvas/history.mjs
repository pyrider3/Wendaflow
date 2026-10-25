// Field patches preserve unrelated streaming updates; references share immutable assets.
function difference(before,after) {
  const a=new Map(before.map(n=>[n.id,n])), b=new Map(after.map(n=>[n.id,n])), changes=[];
  for(const id of new Set([...a.keys(),...b.keys()])) {
    const old=a.get(id), next=b.get(id);
    if(old===next)continue;
    if(!old || !next) {changes.push({id,old,next});continue;}
    const keys=[...new Set([...Object.keys(old),...Object.keys(next)])].filter(k=>!Object.is(old[k],next[k]));
    if(keys.length)changes.push({id,old,next,keys});
  }
  return changes;
}
export class NodeHistory {
  constructor(limit=80){this.limit=limit;this.past=[];this.future=[];this.group=null;}
  begin(nodes){if(!this.group)this.group={before:nodes,touched:new Map()};}
  end(nodes){if(!this.group)return;const {before,touched}=this.group;this.group=null;const delta=difference(before,nodes).flatMap(c=>{if(!touched.has(c.id))return [];const keys=touched.get(c.id);if(c.keys && keys){c.keys=c.keys.filter(k=>keys.has(k));if(!c.keys.length)return [];}return [c];});this.push(delta);}
  record(before,after){const delta=difference(before,after);if(this.group){for(const c of delta){if(!c.keys){this.group.touched.set(c.id,null);continue;}if(this.group.touched.has(c.id) && this.group.touched.get(c.id)===null)continue;const keys=this.group.touched.get(c.id)||new Set();c.keys.forEach(k=>keys.add(k));this.group.touched.set(c.id,keys);}return;}this.push(delta);}
  push(delta){if(!delta.length)return;this.past.push(delta);if(this.past.length>this.limit)this.past.shift();this.future=[];}
  apply(nodes,changes,direction){
    const map=new Map(nodes.map(n=>[n.id,n]));
    for(const c of changes){const target=c[direction];
      if(!c.keys){if(target)map.set(c.id,target);else map.delete(c.id);continue;}
      const current=map.get(c.id);if(!current)continue;
      const copy={...current};for(const key of c.keys){if(Object.hasOwn(target,key))copy[key]=target[key];else delete copy[key];}map.set(c.id,copy);
    }
    return [...map.values()];
  }
  undo(nodes){this.end(nodes);const delta=this.past.pop();if(!delta)return nodes;this.future.push(delta);return this.apply(nodes,delta,'old');}
  redo(nodes){const delta=this.future.pop();if(!delta)return nodes;this.past.push(delta);return this.apply(nodes,delta,'next');}
}
