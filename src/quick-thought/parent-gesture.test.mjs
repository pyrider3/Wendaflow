import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {attachThoughtChild} from './ideas.js';
import {updateRelationDragState} from './interactions.mjs';

test('actual right-drag release creates a parent link from the pressed card, without references from other selected cards',()=>{
 const source=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
 const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='endPointer');
 let result;
 const nodes=[{id:'other',type:'thought'},{id:'parent',type:'thought',relations:[{id:'keep',targetId:'other',type:'reference'}]},{id:'child',type:'thought'}];
 const noop=()=>{};
 const context={endHistory:noop,worldRef:{current:null},pulseThought:noop,nodes,attachThoughtChild,event:{type:'pointerup'},relationDragRef:{current:{quick:true,moved:true,sourceId:'parent',sourceIds:['other','parent'],targetId:'child'}},quickBlankClick:{current:null},suppressContextMenuUntilRef:{current:0},panning:null,panInputRef:{current:null},marquee:null,resizingRef:{current:null},setNodes:next=>{result=next;},setCollapsedIds:noop,setRelationDrag:noop,setDragging:noop,setPanning:noop,setMarquee:noop,setResizing:noop};
 vm.runInNewContext(source.slice(handler.start,handler.end)+'\nendPointer(event)',context);
 assert.equal(result[2].parentId,'parent');
 assert.equal(result[0].relations,undefined);
 assert.deepEqual(result[1].relations,nodes[1].relations);
 assert.equal(result[2].relations,undefined);
 assert.equal(context.relationDragRef.current,null);
});

test('fast right-drag release > 5px connects instead of opening quick menu even when moved was not set yet',()=>{
 const source=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
 const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='endPointer');
 let menuOpened=false,created=null;
 const nodes=[{id:'parent',type:'thought'}];
 const noop=()=>{};
 class El{closest(){return null;}}
 const context={
  endHistory:noop,nodes,updateRelationDragState,
  event:{type:'pointerup',clientX:260,clientY:140,altKey:false},
  relationDragRef:{current:{quick:true,moved:false,startX:100,startY:100,x:100,y:100,sourceId:'parent',sourceIds:['parent'],targetId:null}},
  quickBlankClick:{current:null},suppressContextMenuUntilRef:{current:0},
  panning:null,panInputRef:{current:null},marquee:null,resizingRef:{current:null},
  document:{elementsFromPoint:()=>[new El()]},HTMLElement:El,
  openQuickMenu:()=>{menuOpened=true;},createQuickIdea:(pt,src)=>{created={pt,src};},
  clientWorld:e=>({x:e.clientX,y:e.clientY}),
  setRelationDrag:noop,setDragging:noop,setPanning:noop,setMarquee:noop,setResizing:noop,
 };
 vm.runInNewContext(source.slice(handler.start,handler.end)+'\nendPointer(event)',context);
 assert.equal(menuOpened,false);
 assert.deepEqual(JSON.parse(JSON.stringify(created)),{pt:{x:260,y:140},src:['parent']});

 // Short click (<= 5px) still opens the quick menu.
 menuOpened=false;created=null;
 context.relationDragRef.current={quick:true,moved:false,startX:100,startY:100,x:100,y:100,sourceId:'parent',sourceIds:['parent'],targetId:null};
 context.event={type:'pointerup',clientX:102,clientY:101,altKey:false};
 vm.runInNewContext(source.slice(handler.start,handler.end)+'\nendPointer(event)',context);
 assert.equal(menuOpened,true);
 assert.equal(created,null);
});

test('plain right-drag onto a node with an existing parent adds another parent by default, while Alt moves the branch',()=>{
 const source=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
 const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='endPointer');
 class El{constructor(id){this.dataset={nodeId:id};}}
 const noop=()=>{};
 let nodes=[{id:'p1',type:'thought'},{id:'p2',type:'thought'},{id:'p3',type:'thought'},{id:'p4',type:'thought'},{id:'child',type:'thought',parentId:'p1'}];
 const runDrop=(sourceId,altKey)=>{
  let nextNodes=null;
  const context={
   endHistory:noop,worldRef:{current:null},pulseThought:noop,nodes,attachThoughtChild,updateRelationDragState,
   event:{type:'pointerup',clientX:260,clientY:140,altKey},
   relationDragRef:{current:{quick:true,moved:false,startX:100,startY:100,x:100,y:100,sourceId,sourceIds:[sourceId],targetId:null}},
   quickBlankClick:{current:null},suppressContextMenuUntilRef:{current:0},
   panning:null,panInputRef:{current:null},marquee:null,resizingRef:{current:null},
   document:{elementsFromPoint:()=>[new El('child')]},HTMLElement:El,
   notify:noop,say:s=>s,tr:s=>s,setStorageWarning:noop,
   setNodes:value=>{nextNodes=value;},setCollapsedIds:noop,setRelationDrag:noop,setDragging:noop,setPanning:noop,setMarquee:noop,setResizing:noop,
  };
  vm.runInNewContext(source.slice(handler.start,handler.end)+'\nendPointer(event)',context);
  return nextNodes;
 };

 // Dragging p2 -> child without modifiers keeps p1 and adds p2 as extraParentIds
 nodes=runDrop('p2',false);
 assert.equal(nodes[4].parentId,'p1');
 assert.deepEqual(nodes[4].extraParentIds,['p2']);

 // Dragging p3 -> child without modifiers keeps p1 & p2 and appends p3
 nodes=runDrop('p3',false);
 assert.equal(nodes[4].parentId,'p1');
 assert.deepEqual(nodes[4].extraParentIds,['p2','p3']);

 // Holding Alt moves the branch to p4 (replacing primary parent p1)
 nodes=runDrop('p4',true);
 assert.equal(nodes[4].parentId,'p4');
 assert.deepEqual(nodes[4].extraParentIds,['p2','p3']);
});
