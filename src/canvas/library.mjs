import {remapNodes} from './document.mjs';
export const LIBRARY_KEY='wendaflow-canvas-library-v1';
export function mergeCanvases(open,closed=[]) {
 const seen=new Set();return [...open,...closed].filter(c=>c&&typeof c.id==='string'&&!seen.has(c.id)&&seen.add(c.id));
}
export function loadLibrary(storage,canvases) {
 let data;try{data=JSON.parse(storage.getItem(LIBRARY_KEY)||'null');}catch{}
 const ids=new Set(canvases.map(c=>c.id));
 return {version:1,cards:data?.cards&&typeof data.cards==='object'?data.cards:{},groups:Array.isArray(data?.groups)?data.groups.filter(g=>g&&typeof g.id==='string'&&typeof g.name==='string'):[],openTabs:Array.isArray(data?.openTabs)?[...new Set(data.openTabs)].filter(id=>ids.has(id)):canvases.filter(c=>!c.closedAt).map(c=>c.id),sidebar:data?.sidebar!==false};
}
export function writeLibrary(storage,data){storage.setItem(LIBRARY_KEY,JSON.stringify(data));return data;}
export function openLibraryTab(meta,id,now=new Date().toISOString()) {
 return {...meta,openTabs:meta.openTabs.includes(id)?meta.openTabs:[...meta.openTabs,id],cards:{...meta.cards,[id]:{...meta.cards[id],lastOpenedAt:now}}};
}
export function visibleLibraryTabs(items,activeId,limit=4) {
 if(items.length<=limit)return items;
 const result=items.slice(-limit);if(!result.some(c=>c.id===activeId)){const active=items.find(c=>c.id===activeId);if(active)result[0]=active;}return result;
}
export function libraryItems(canvases,meta) {
 return canvases.map(c=>({...c,...meta.cards[c.id],isOpen:meta.openTabs.includes(c.id)}));
}
export function queryLibrary(items,{query='',filter='recent',sort='recent'}={}) {
 const needle=query.trim().toLocaleLowerCase();
 return items.filter(c=>filter==='trash'?!!c.trashedAt:!c.trashedAt).filter(c=>filter==='starred'?c.starred:filter.startsWith('group:')?c.groupId===filter.slice(6):true).filter(c=>!needle||c.name.toLocaleLowerCase().includes(needle)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):String(b.lastOpenedAt||b.updatedAt||'').localeCompare(String(a.lastOpenedAt||a.updatedAt||'')));
}
export function summarizeCanvas(state) {
 const nodes=state?.nodes||[];return {count:nodes.length,nodes:nodes.slice(0,70).map(({id,x,y,parentId,type,title})=>({id,x,y,parentId,type,label:String(title||'').slice(0,12)})),unavailable:!state};
}
export function reorderLibraryTabs(meta,source,target){
 if(source===target||!meta.openTabs.includes(source)||!meta.openTabs.includes(target))return meta;
 const openTabs=meta.openTabs.filter(id=>id!==source);openTabs.splice(openTabs.indexOf(target),0,source);return {...meta,openTabs};
}

export function duplicateCanvasState(state,idFactory){
 const copy=JSON.parse(JSON.stringify(state));
 const map=new Map(copy.nodes.map(n=>[n.id,idFactory()]));
 return {...copy,nodes:remapNodes(copy.nodes,map).map(n=>['queued','thinking','streaming','running'].includes(n.status)?{...n,status:'stopped',generationPhase:null}:n),selectedId:map.get(copy.selectedId)||null,collapsedIds:(copy.collapsedIds||[]).map(id=>map.get(id)).filter(Boolean)};
}

// Explicit lifetime markers protect imported/copied/legacy canvases. The legacy
// fallback recognizes only the exact empty placeholder written by old New Canvas.
export function isTemporaryCanvas(canvas,policy={},stored) {
 if(!canvas||policy[canvas.id]===true||canvas.temporary===false||canvas.savedAt||canvas.closedAt)return false;
 if(canvas.temporary===true)return true;
 if(!/^(新画布|New canvas)\s+\d+$/.test(canvas.name||'')||!stored)return false;
 const keys=Object.keys(stored);
 return keys.every(key=>['nodes','selectedId','collapsedIds','viewport'].includes(key))&&Array.isArray(stored.nodes)&&stored.nodes.length===0&&stored.selectedId==null&&Array.isArray(stored.collapsedIds)&&stored.collapsedIds.length===0&&stored.viewport?.x===20&&stored.viewport?.y===20&&stored.viewport?.zoom===.9;
}
export function durableCanvasIndex(canvases,activeId,policy={},discarded=new Set()) {
 const saved=canvases.filter(canvas=>!discarded.has(canvas.id)&&!isTemporaryCanvas(canvas,policy));
 return {canvases:saved,activeId:saved.some(canvas=>canvas.id===activeId)?activeId:saved.at(-1)?.id||null};
}
