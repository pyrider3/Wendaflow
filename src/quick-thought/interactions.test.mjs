import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse} from '@babel/parser';
import {newThought} from './ideas.js';import {crossedDragThreshold,combineSelection,connectionIntent,updateRelationDragState,relativeIdeaPoint,directionalNeighbor} from './interactions.mjs';
const a={id:'a',type:'thought',x:0,y:0},b={id:'b',type:'thought',x:200,y:0,parentId:'a'},c={id:'c',type:'thought',x:400,y:0,parentId:'b'};
test('new idea text anchor matches the creation point rather than old fixed card dimensions',()=>{const n=newThought({x:100,y:80},'idea',null,'n');assert.equal(n.x+14,100);assert.equal(n.y+10,80);});
test('drag threshold uses screen pixels independent of canvas zoom',()=>{const drag={startX:100,startY:100};assert.equal(crossedDragThreshold(drag,{clientX:102,clientY:102}),false);assert.equal(crossedDragThreshold(drag,{clientX:103,clientY:104}),true);assert.equal(crossedDragThreshold({...drag,started:true},{clientX:100,clientY:100}),true);});
test('marquee union and subtraction always start from original selection',()=>{assert.deepEqual([...combineSelection(['a'],['b'],'add')],['a','b']);assert.deepEqual([...combineSelection(['a','b'],['a'],'subtract')],['b']);assert.deepEqual([...combineSelection(['a'],[],'add')],['a']);assert.deepEqual([...combineSelection(['a'],['b'],'replace')],['b']);});
test('link preview differentiates cycles, same link, reparenting and mixed card types',()=>{const nodes=[a,b,c,{id:'chat',type:'conversation'}];assert.equal(connectionIntent(nodes,'c','a'),'cycle');assert.equal(connectionIntent(nodes,'a','b'),'connected');assert.equal(connectionIntent(nodes,'a','c'),'reparent');assert.equal(connectionIntent(nodes,'a','chat'),'connect');assert.equal(connectionIntent(nodes,'a','a'),'self');assert.equal(connectionIntent(nodes,'b',null),'empty');});
test('continuous creation skips occupied space and preserves same column for siblings',()=>{const sizes=new Map([['a',{width:95,height:47}],['b',{width:95,height:47}]]);const child=relativeIdeaPoint(a,'child',[a,b],sizes);assert.ok(child.x-14>=175);const sibling=relativeIdeaPoint(a,'sibling',[a,{...b,x:0,y:75}],sizes);assert.equal(sibling.x-14,0);assert.ok(sibling.y-10>=150);});
test('direction navigation prefers aligned nearby ideas over distant ones',()=>{assert.equal(directionalNeighbor(a,'ArrowRight',[a,b,c],new Map()).id,'b');assert.equal(directionalNeighbor(a,'ArrowLeft',[a,b,c],new Map()),null);});
const source=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
function extracted(name,context){const f=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);vm.createContext(context);vm.runInContext(source.slice(f.start,f.end),context);return context[name];}
test('actual node motion ignores click jitter, then tracks pointer directly after threshold',()=>{let updates=0,result;const ctx={quickBlankClick:{current:null},relationDrag:null,resizing:null,marquee:null,dragging:{startX:100,startY:100,positions:new Map([['a',{x:0,y:0}]]),ids:['a'],started:false},viewport:{zoom:2},viewportRef:{current:{zoom:2}},crossedDragThreshold,setDragging:value=>ctx.dragging=value,setNodes:f=>{updates++;result=f([a]);}};const move=extracted('movePointer',ctx);move({clientX:102,clientY:101});assert.equal(updates,0);move({clientX:110,clientY:100});assert.equal(result[0].x,5);assert.equal(ctx.dragging.started,true);});
test('clearing an existing quick idea produces an empty card rather than silently restoring text',()=>{let output,notice='';const node={...a,title:'Old',content:'Old'};const ctx={nodes:[node],quickEditor:{id:'a',value:'',created:false,preserveTitle:false},setNodes:f=>output=f([node]),endHistory:()=>{},setQuickEditor:()=>{},pulseThought:()=>{},worldRef:{},notify:message=>notice=message,say:s=>s};extracted('saveQuickIdea',ctx)();assert.equal(output[0].title,'');assert.equal(output[0].content,'');assert.ok(notice.length);});

test('continuous child creation uses current editor dimensions after text expands',()=>{let point;const ctx={nodes:[a],nodeSizes:new Map([['a',{width:79,height:45}]]),quickEditor:{id:'a'},worldRef:{current:{querySelector:()=>({offsetWidth:340,offsetHeight:96}),querySelectorAll:()=>[]}},relativeIdeaPoint,createQuickIdea:p=>point=p};extracted('createRelativeIdea',ctx)('child',a,true);assert.equal(point.x,434);});

test('movePointer tracks relationDragRef before React commits relationDrag state',()=>{
  const start={sourceId:'a',sourceIds:['a'],x:100,y:100,startX:100,startY:100,targetId:null,quick:true,reference:false,moved:false};
  let committed=null;
  const ctx={
    quickBlankClick:{current:null},
    relationDrag:null,
    relationDragRef:{current:start},
    nodes:[a,b],
    updateRelationDragState,
    document:{elementsFromPoint:()=>[{dataset:{nodeId:'c'},closest:()=>null}]},
    HTMLElement:function(){},
    setRelationDrag:value=>{committed=value;},
  };
  // Verify with an HTMLElement instance check via a minimal class
  class El{constructor(id){this.dataset={nodeId:id};}}
  ctx.HTMLElement=El;
  ctx.document={elementsFromPoint:()=>[new El('b')]};
  const move=extracted('movePointer',ctx);
  move({clientX:160,clientY:120,altKey:false});
  assert.equal(ctx.relationDragRef.current.moved,true);
  assert.equal(ctx.relationDragRef.current.targetId,'b');
  assert.equal(committed.moved,true);
  assert.equal(committed.targetId,'b');
});

test('dragging onto a node with an existing parent defaults to adding an extra parent unless Alt is held',()=>{
  const nodes=[a,b,{id:'d',type:'thought',x:0,y:120}];
  const start={sourceId:'d',sourceIds:['d'],x:10,y:10,startX:10,startY:10,targetId:null,quick:true,reference:false,moved:false};
  const added=updateRelationDragState(start,{clientX:210,clientY:20},'b',nodes,false);
  assert.equal(added.intent,'reparent');
  assert.equal(added.extra,true);
  assert.equal(added.targetId,'b');
  const replaced=updateRelationDragState(start,{clientX:210,clientY:20},'b',nodes,true);
  assert.equal(replaced.intent,'reparent');
  assert.equal(replaced.extra,false);
  assert.equal(replaced.targetId,'b');
});
