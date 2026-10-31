export function canEditCard(node) { return node?.type === 'thought'; }
export function cardIds(nodes, ids) {return new Set(nodes.filter(n=>ids.has(n.id)).map(n=>n.id));}
export function pastedCardNodes(text) {
 try {const data=JSON.parse(text);return data?.type==='wonderful-nodes' && Array.isArray(data.nodes)?data.nodes:null;}catch{return null;}
}
