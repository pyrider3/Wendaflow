import test from 'node:test';
import assert from 'node:assert/strict';
import {thoughtIds,boxThoughtIds,attachThoughtChild,newThought,deletionBackups,removeNodeRecords} from './ideas.js';
import {quickThoughtCopy,quickThoughtLocales} from './labels.js';
const nodes=[{id:'idea',type:'thought',x:0,y:0,title:'idea',content:'idea'},{id:'chat',type:'conversation',parentId:'idea',x:300,y:0,content:'answer',attachments:[{name:'keep.txt'}],links:['idea'],relations:[{targetId:'idea',type:'reference'}]},{id:'action',type:'action',x:600,y:0,status:'done',execution:{events:['completed']}}];
test('mixed selections can only delete ideas in quick mode',()=>{
 const ids=thoughtIds(nodes,new Set(['idea','chat','action']));assert.deepEqual([...ids],['idea']);
 const result=removeNodeRecords(nodes,ids);assert.equal(result.length,2);assert.equal(result[0].content,'answer');assert.deepEqual(result[0].attachments,nodes[1].attachments);assert.deepEqual(result[1].execution,nodes[2].execution);assert.equal(result[0].parentId,null);
 assert.equal(nodes[1].parentId,'idea');
});
test('undo backup includes survivor inheritance, legacy links and references',()=>{
 const backups=deletionBackups(nodes,new Set(['idea']));assert.equal(backups.length,1);
 const removed=removeNodeRecords(nodes,new Set(['idea']));const restored={...removed[0],...backups[0]};
 assert.deepEqual(restored,nodes[1]);
});
test('left box selection excludes conversation and action cards at any zoom',()=>{
 const sizes=new Map(nodes.map(n=>[n.id,{width:224,height:110}]));const box={startX:-10,startY:-10,x:2000,y:1000};
 assert.deepEqual(boxThoughtIds(nodes,sizes,{x:20,y:20,zoom:.5},box),['idea']);
 assert.deepEqual(boxThoughtIds(nodes,sizes,{x:20,y:20,zoom:2},{startX:600,startY:600,x:500,y:500}),[]);
 assert.deepEqual(boxThoughtIds(nodes,sizes,{x:20,y:20,zoom:.5},{startX:150,startY:100,x:0,y:0}),['idea']);
});
test('fast creation only produces manual ideas with no pending model or action',()=>{
 const n=newThought({x:-100,y:40},'new','idea','test-id');assert.equal(n.type,'thought');assert.equal(n.status,'done');assert.equal(n.model,null);assert.equal(n.prompt,null);assert.equal(n.parentId,'idea');assert.equal(n.x,-212);assert.equal(n.y,-15);assert.equal(n.execution,undefined);assert.equal(n.modelValue,undefined);
});
test('quick-thinking controls have complete copy in all 11 locales',()=>{
 assert.equal(quickThoughtLocales.length,11);
 for(const language of quickThoughtLocales){const labels=quickThoughtCopy(language);assert.equal(Object.keys(labels).length,13);assert.ok(Object.values(labels).every(v=>typeof v==='string'&&v.length),language);}
});

test('quick marquee selects partial overlap and exact edge contact in either direction at any zoom',()=>{
 const cards=[{id:'a',type:'thought',x:100,y:100},{id:'chat',type:'conversation',x:100,y:100},{id:'action',type:'action',x:100,y:100}];
 const sizes=new Map([['a',{width:300,height:180}]]);
 for(const zoom of [.5,1,2]) {
  const viewport={x:-30,y:40,zoom};
  const left=viewport.x+100*zoom,top=viewport.y+100*zoom,right=left+300*zoom,bottom=top+180*zoom;
  const boxes=[{startX:left-20,startY:top-20,x:left+10,y:top+10},{startX:left-20,startY:top,x:left,y:top+10},{startX:right,startY:top,x:right+20,y:top+10},{startX:left,startY:bottom,x:left+10,y:bottom+20},{startX:right+20,startY:bottom+20,x:right-10,y:bottom-10}];
  for(const box of boxes)assert.deepEqual(boxThoughtIds(cards,sizes,viewport,box),['a']);
  assert.deepEqual(boxThoughtIds(cards,sizes,viewport,{startX:right+1,startY:top,x:right+20,y:bottom}),[]);
 }
});

test('right-drag attaches the drop target as a child, preserves real references and prevents cycles',()=>{
 const records=[{id:'parent',type:'thought',content:'parent context',relations:[{id:'ref',targetId:'other',type:'reference'}]},{id:'child',type:'thought',parentId:'other',content:'child context'},{id:'grandchild',type:'thought',parentId:'child'},{id:'other',type:'thought'},{id:'chat',type:'conversation'}];
 const result=attachThoughtChild(records,'parent','child');
 assert.equal(result.find(n=>n.id==='child').parentId,'parent');
 assert.equal(result[0],records[0]);assert.equal(result[2],records[2]);assert.equal(result[1].relations,undefined);
 assert.equal(records[1].parentId,'other');
 assert.equal(attachThoughtChild(result,'grandchild','parent'),result);
 assert.equal(attachThoughtChild(result,'parent','parent'),result);
 assert.equal(attachThoughtChild(result,'parent','chat'),result);
 const loaded=JSON.parse(JSON.stringify(result));assert.equal(loaded[1].parentId,'parent');assert.equal(loaded[0].relations[0].type,'reference');
});
