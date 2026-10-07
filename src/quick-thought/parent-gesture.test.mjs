import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {attachThoughtChild} from './ideas.js';

test('actual right-drag release creates a parent link from the pressed card, without references from other selected cards',()=>{
 const source=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
 const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='endPointer');
 let result;
 const nodes=[{id:'other',type:'thought'},{id:'parent',type:'thought',relations:[{id:'keep',targetId:'other',type:'reference'}]},{id:'child',type:'thought'}];
 const noop=()=>{};
 const context={nodes,attachThoughtChild,event:{type:'pointerup'},relationDragRef:{current:{quick:true,moved:true,sourceId:'parent',sourceIds:['other','parent'],targetId:'child'}},quickBlankClick:{current:null},suppressContextMenuUntilRef:{current:0},panning:null,marquee:null,resizingRef:{current:null},setNodes:next=>{result=next;},setCollapsedIds:noop,setRelationDrag:noop,setDragging:noop,setPanning:noop,setMarquee:noop,setResizing:noop};
 vm.runInNewContext(source.slice(handler.start,handler.end)+'\nendPointer(event)',context);
 assert.equal(result[2].parentId,'parent');
 assert.equal(result[0].relations,undefined);
 assert.deepEqual(result[1].relations,nodes[1].relations);
 assert.equal(result[2].relations,undefined);
 assert.equal(context.relationDragRef.current,null);
});
