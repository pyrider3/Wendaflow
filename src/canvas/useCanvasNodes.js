import {useRef,useState} from 'react';
import {NodeHistory} from './history.mjs';
export function useCanvasNodes(initial,canvasId) {
  const [nodes,render]=useState(initial);
  const store=useRef({id:canvasId,nodes:initial,histories:new Map()});
  const history=id=>{if(!store.current.histories.has(id))store.current.histories.set(id,new NodeHistory());return store.current.histories.get(id);};
  function change(value,record=true){
    if(store.current.id!==canvasId)return;
    const before=store.current.nodes,after=typeof value==='function'?value(before):value;
    if(after===before)return;
    if(record)history(canvasId).record(before,after);
    store.current.nodes=after;render(after);
  }
  return {nodes,canUndo:history(canvasId).past.length>0,canRedo:history(canvasId).future.length>0,setNodes:value=>change(value),setNodesBackground:value=>change(value,false),
    currentNodes:()=>store.current.nodes,
    replaceNodes:(value,id=canvasId)=>{history(store.current.id).end(store.current.nodes);store.current.id=id;store.current.nodes=value;render(value);},
    beginHistory:()=>history(canvasId).begin(store.current.nodes),endHistory:()=>history(canvasId).end(store.current.nodes),
    undoNodes:()=>change(history(canvasId).undo(store.current.nodes),false),redoNodes:()=>change(history(canvasId).redo(store.current.nodes),false)};
}
