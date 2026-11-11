import test from 'node:test';
import assert from 'node:assert/strict';
import {attachThoughtChild,removeNodeRecords} from '../quick-thought/ideas.js';
import {connectionIntent} from '../quick-thought/interactions.mjs';
import {removeSliceRecords} from '../quick-thought/slice.js';
import {detachParent,parentIdsOf} from './parents.mjs';
import {contextPlan} from '../modelGateway.js';
import {normalizeWdf} from './document.mjs';
import {createGraphIndex} from './graph-index.mjs';

const base=()=>[{id:'a',type:'thought',title:'A'},{id:'b',type:'thought',title:'B'},{id:'c',type:'thought',title:'C',parentId:'a'}];

test('shift-drop adds a second parent and keeps the first',()=>{
  const next=attachThoughtChild(base(),'b','c',true);
  const c=next.find(n=>n.id==='c');
  assert.equal(c.parentId,'a');
  assert.deepEqual(c.extraParentIds,['b']);
  assert.equal(attachThoughtChild(next,'b','c',true),next);
});
test('plain drop still moves the branch and clears an extra parent that became primary',()=>{
  const two=attachThoughtChild(base(),'b','c',true);
  const moved=attachThoughtChild(two,'b','c').find(n=>n.id==='c');
  assert.equal(moved.parentId,'b');
  assert.equal(moved.extraParentIds,undefined);
});
test('extra parents cannot create cycles',()=>{
  const two=attachThoughtChild(base(),'b','c',true);
  assert.equal(attachThoughtChild(two,'c','b',true),two);
  assert.equal(connectionIntent(two,'c','b'),'cycle');
  assert.equal(connectionIntent(two,'b','c'),'connected');
});
test('detaching the primary promotes the first extra parent',()=>{
  const c=attachThoughtChild(base(),'b','c',true).find(n=>n.id==='c');
  const next=detachParent(c,'a');
  assert.equal(next.parentId,'b');assert.equal(next.extraParentIds,undefined);
  assert.deepEqual(parentIdsOf(detachParent(c,'b')),['a']);
});
test('deleting or slicing one parent keeps the other',()=>{
  const two=attachThoughtChild(base(),'b','c',true);
  assert.equal(removeNodeRecords(two,new Set(['a'])).find(n=>n.id==='c').parentId,'b');
  const sliced=removeSliceRecords(two,new Set(),[{kind:'parent',sourceId:'b',childId:'c'}]).find(n=>n.id==='c');
  assert.equal(sliced.parentId,'a');assert.equal(sliced.extraParentIds,undefined);
});
test('context includes both parents branches, placed before the card that has them',()=>{
  const nodes=attachThoughtChild([...base(),{id:'d',type:'thought',title:'D',parentId:'c'}],'b','c',true);
  assert.deepEqual(contextPlan(nodes,'d').map(i=>i.node.id),['a','b','c','d']);
});
test('graph ancestors and saved documents keep extra parents, dropping bad ones',()=>{
  const nodes=attachThoughtChild(base(),'b','c',true);
  assert.ok(createGraphIndex(nodes).ancestorIds(['c']).has('b'));
  const doc=normalizeWdf({format:'branchspace-wdf',version:1,nodes:nodes.map((n,i)=>({...n,x:i,y:i,...(n.id==='c'?{extraParentIds:['b','c','zzz','a']}:{})}))});
  assert.deepEqual(doc.nodes.find(n=>n.id==='c').extraParentIds,['b']);
});
