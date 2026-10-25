import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraBounds,cardsInView,sameCardProps} from './visibility.mjs';
import {needsViewportSnapshot} from './camera.mjs';

test('a visible member of a 400-card branch does not mount the entire branch',()=>{
  const nodes=Array.from({length:400},(_,i)=>({id:String(i),parentId:i?String(i-1):null,x:i*400,y:0}));
  const mounted=cardsInView(nodes,new Map(),cameraBounds({x:0,y:0,zoom:1},{width:1000,height:700}));
  assert.deepEqual(mounted.map(n=>n.id),['0','1','2','3']);
  assert.strictEqual(mounted[0],nodes[0]);
});
test('intersection includes a large card whose origin is outside; explicit interaction pins survive',()=>{
  const nodes=[{id:'large',x:-900,y:0},{id:'editing',x:9000,y:9000},{id:'child',parentId:'editing',x:9500,y:9000}];
  const mounted=cardsInView(nodes,new Map([['large',{width:950,height:80}]]),{left:0,top:0,right:1000,bottom:700},new Set(['editing']));
  assert.deepEqual(mounted.map(n=>n.id),['large','editing']);
});
test('long pan and zoom refresh before the mounted overscan can expose an unmounted card',()=>{
  const nodes=Array.from({length:2000},(_,i)=>({id:String(i),x:(i%100)*200,y:Math.floor(i/100)*180}));
  const size={width:1000,height:700},sizes=new Map();let snapshot={x:0,y:0,zoom:1};
  for(let i=0;i<180;i++){
    const live={x:-i*35,y:-i*8,zoom:1-i*.003};
    if(needsViewportSnapshot(snapshot,live,size))snapshot=live;
    const mounted=new Set(cardsInView(nodes,sizes,cameraBounds(snapshot,size)).map(n=>n.id));
    const exact={left:-live.x/live.zoom,top:-live.y/live.zoom,right:(size.width-live.x)/live.zoom,bottom:(size.height-live.y)/live.zoom};
    for(const n of cardsInView(nodes,sizes,exact))assert.ok(mounted.has(n.id),`missing ${n.id} at frame ${i}`);
  }
});
const runtime={current:null};
const props=node=>({node,runtime,uiLanguage:'zh-CN',showThinking:false,tabIndex:-1,className:'node thought full',style:{transform:`translate(${node.x}px, 0px)`},view:{editing:false,editDraft:null,displayTitle:node.content,childCount:0,hiddenCount:0,collapsed:false,branching:false}});
test('streaming one card invalidates only that card; recreated value objects do not invalidate peers',()=>{
  const nodes=Array.from({length:100},(_,i)=>({id:String(i),x:i*100,content:'hello'}));
  const before=nodes.map(props),after=nodes.map((n,i)=>props(i===17?{...n,content:'hello world'}:n));
  assert.deepEqual(after.flatMap((p,i)=>sameCardProps(before[i],p)?[]:[i]),[17]);
});
test('selection, editing, language, preview size and animation changes always reach a card',()=>{
  const a=props({id:'a',x:0,content:'hello'});
  for(const patch of [{tabIndex:0},{className:'node thought selected newborn'},{uiLanguage:'en'},{showThinking:true},{style:{...a.style,'--preview-width':'184px'}},{view:{...a.view,editing:true,editDraft:{content:'new'}}},{view:{...a.view,collapsed:true,hiddenCount:4}}])assert.equal(sameCardProps(a,{...a,...patch}),false);
  assert.equal(sameCardProps(a,{...a,renderData:{copy:{idea:'Idea'}}}),false);
});

test('edge culling preserves crossing curves but excludes distant branches',async()=>{
  const {connectionInView}=await import('./visibility.mjs');
  const size={width:100,height:50},bounds={left:0,top:0,right:1000,bottom:700};
  assert.equal(connectionInView('parent',{x:-300,y:100},{x:1500,y:100},size,size,bounds),true);
  assert.equal(connectionInView('parent',{x:2000,y:100},{x:3000,y:100},size,size,bounds),false);
  assert.equal(connectionInView('relation',{x:500,y:730},{x:500,y:750},size,size,bounds),false);
  // Control points extend into view while both reference endpoints are outside.
  assert.equal(connectionInView('relation',{x:500,y:-80},{x:500,y:720},size,size,bounds),true);
});
