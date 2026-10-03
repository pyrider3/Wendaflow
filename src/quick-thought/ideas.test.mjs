import test from 'node:test';
import assert from 'node:assert/strict';
import {thoughtIds,boxThoughtIds,newThought,deletionBackups,removeNodeRecords} from './ideas.js';
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
 assert.deepEqual(boxThoughtIds(nodes,sizes,{x:20,y:20,zoom:2},{startX:300,startY:300,x:0,y:0}),[]);
 assert.deepEqual(boxThoughtIds(nodes,sizes,{x:20,y:20,zoom:.5},{startX:150,startY:100,x:0,y:0}),['idea']);
});
test('fast creation only produces manual ideas with no pending model or action',()=>{
 const n=newThought({x:-100,y:40},'new','idea','test-id');assert.equal(n.type,'thought');assert.equal(n.status,'done');assert.equal(n.model,null);assert.equal(n.prompt,null);assert.equal(n.parentId,'idea');assert.equal(n.x,-212);assert.equal(n.y,-15);assert.equal(n.execution,undefined);assert.equal(n.modelValue,undefined);
});
test('quick-thinking controls have complete copy in all 11 locales',()=>{
 assert.equal(quickThoughtLocales.length,11);
 for(const language of quickThoughtLocales){const labels=quickThoughtCopy(language);assert.equal(Object.keys(labels).length,13);assert.ok(Object.values(labels).every(v=>typeof v==='string'&&v.length),language);}
});
