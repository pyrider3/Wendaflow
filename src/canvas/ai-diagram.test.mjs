import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramPrompt,parseDiagram,applyDiagram} from './ai-diagram.mjs';

const reply='```json\n{"nodes":[{"id":"n1","title":"输入"},{"id":"n2","title":"解析","body":"拆成词"},{"id":"n3","title":"规则"},{"id":"n4","title":"输出"}],"edges":[{"from":"n1","to":"n2","kind":"parent"},{"from":"n2","to":"n4","kind":"parent"},{"from":"n3","to":"n4","kind":"parent"},{"from":"n4","to":"n1","kind":"reference"},{"from":"n1","to":"zzz","kind":"parent"}]}\n```';

test('parses fenced JSON, drops unknown edges, and fails loudly on junk',()=>{
  const d=parseDiagram(reply);
  assert.equal(d.nodes.length,4);assert.equal(d.edges.length,4);
  assert.throws(()=>parseDiagram('抱歉我不会'));
  assert.throws(()=>parseDiagram('{"nodes":[]}'));
});
test('a node with two upstream lines gets a primary and an extra parent, laid out left to right',()=>{
  const {nodes,createdIds,edgeCount}=applyDiagram([],parseDiagram(reply),{origin:{x:100,y:50},stamp:1});
  assert.equal(createdIds.length,4);assert.equal(edgeCount,4);
  const by=Object.fromEntries(nodes.map(n=>[n.title,n]));
  assert.equal(by['输出'].parentId,by['解析'].id);
  assert.deepEqual(by['输出'].extraParentIds,[by['规则'].id]);
  assert.equal(by['输出'].relations[0].targetId,by['输入'].id);
  assert.equal(by['输入'].relations,undefined);
  assert.ok(by['输入'].x<by['解析'].x&&by['解析'].x<by['输出'].x);
  assert.equal(by['输入'].x,100);
  const keys=nodes.map(n=>`${n.x},${n.y}`);assert.equal(new Set(keys).size,keys.length);
});
test('edges can attach new cards to existing ones without re-parenting them',()=>{
  const existing=[{id:'old',type:'thought',title:'旧',x:10,y:20,parentId:null},{id:'old2',type:'thought',title:'旧2',x:0,y:0,parentId:'old'}];
  const d=parseDiagram('{"nodes":[{"id":"a","title":"新"}],"edges":[{"from":"old","to":"a","kind":"parent"},{"from":"a","to":"old2","kind":"parent"}]}',['old','old2']);
  const {nodes}=applyDiagram(existing,d,{origin:{x:0,y:0},stamp:2});
  const a=nodes.find(n=>n.title==='新');
  assert.equal(a.parentId,'old');assert.equal(a.x,310);assert.equal(a.y,20);
  assert.equal(nodes.find(n=>n.id==='old2').parentId,'old');
  assert.equal(a.relations[0].targetId,'old2');
});
test('cyclic parent lines are dropped and the prompt lists existing cards',()=>{
  const d=parseDiagram('{"nodes":[{"id":"a","title":"A"},{"id":"b","title":"B"}],"edges":[{"from":"a","to":"b","kind":"parent"},{"from":"b","to":"a","kind":"parent"}]}');
  const {nodes}=applyDiagram([],d,{origin:{x:0,y:0},stamp:3});
  assert.equal(nodes.filter(n=>n.parentId).length,1);
  assert.match(diagramPrompt('画图',[{id:'x1',title:'想法'}]),/x1: 想法/);
});

test('a half-streamed reply yields only the cards that fully arrived, with their own lines',()=>{
  const full='{"nodes":[{"id":"a","title":"开始","parents":[]},{"id":"b","title":"处理","parents":["a"]},{"id":"c","title":"结束","parents":["b","a"],"refs":["a"]}]}';
  assert.equal(parseDiagram('{"nodes":[{"id":"a","tit',[],{partial:true}),null);
  const half=parseDiagram(full.slice(0,full.indexOf('{"id":"c"')+30),[],{partial:true});
  assert.equal(half.nodes.length,2);assert.deepEqual(half.edges,[{from:'a',to:'b',kind:'parent'}]);
  const all=parseDiagram(full);
  assert.equal(all.nodes.length,3);assert.equal(all.edges.length,4);
  const {nodes}=applyDiagram([],all,{origin:{x:0,y:0},stamp:9});
  assert.equal(nodes.find(n=>n.title==='结束').extraParentIds.length,1);
});

test('reference lines are capped so a chatty model cannot bury the diagram',()=>{
  const nodes=Array.from({length:18},(_,i)=>({id:'n'+i,title:'T'+i,parents:i?['n'+(i-1)]:[],refs:i>1?['n0']:[]}));
  const d=parseDiagram(JSON.stringify({nodes}));
  assert.equal(d.edges.filter(e=>e.kind==='reference').length,3);
  assert.equal(d.edges.filter(e=>e.kind==='parent').length,17);
});
