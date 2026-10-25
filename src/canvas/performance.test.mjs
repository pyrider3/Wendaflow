import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse} from '@babel/parser';
import {createGraphIndex} from './graph-index.mjs';import {ConnectionGeometry,connectionPath,viewportTransform,needsViewportSnapshot} from './camera.mjs';
const nodes=[{id:'a',x:0,y:0},{id:'b',x:200,y:0,parentId:'a'},{id:'c',x:400,y:0,parentId:'b'},{id:'d',x:200,y:100,parentId:'a'},{id:'root',x:0,y:200}];
test('graph index matches children, ancestors, descendants and collapsed visibility',()=>{const g=createGraphIndex(nodes);assert.equal(g.children.get('a').length,2);assert.equal(g.descendantCount.get('a'),3);assert.equal(g.descendantCount.get('b'),1);assert.equal(g.isDescendant('c','a'),true);assert.equal(g.isDescendant('a','c'),false);assert.deepEqual(g.ancestors('c').map(n=>n.id),['a','b','c']);assert.deepEqual([...g.ancestorIds(['c','d'])].sort(),['a','b','c','d']);assert.deepEqual(g.visibleNodes(new Set(['b'])).map(n=>n.id),['a','b','d','root']);assert.strictEqual(g.visibleNodes(new Set()),nodes);});
test('deep 20000-node chains have bounded iterative index construction and queries',()=>{const input=Array.from({length:20000},(_,i)=>({id:String(i),parentId:i?String(i-1):null}));const g=createGraphIndex(input);assert.equal(g.descendantCount.get('0'),19999);assert.equal(g.isDescendant('19999','0'),true);assert.equal(g.visibleNodes(new Set(['10000'])).length,10001);});
test('malformed cached cycles cannot hang the index',()=>{const g=createGraphIndex([{id:'a',parentId:'b'},{id:'b',parentId:'a'},{id:'orphan',parentId:'missing'}]);assert.equal(g.byId.size,3);assert.equal(g.ancestors('a').length,2);assert.equal(g.visibleNodes(new Set()).length,3);});
test('camera snapshots are not published for ordinary pan/zoom frames inside overscan',()=>{const size={width:1280,height:720},start={x:20,y:20,zoom:.82};assert.equal(needsViewportSnapshot(start,{x:-190,y:-15,zoom:.82},size),false);assert.equal(needsViewportSnapshot(start,{x:-800,y:20,zoom:.82},size),true);assert.equal(needsViewportSnapshot(start,{x:20,y:20,zoom:.5},size,true),true);assert.equal(needsViewportSnapshot(start,{x:10,y:20,zoom:.8},size,true),false);});
function fixture(){const graph=new Map(nodes.map(n=>[n.id,n])),sizes=new Map(nodes.map(n=>[n.id,{width:100,height:40}]));let callback,requests=0;const path=(source,target,kind='parent')=>({dataset:{connectionKind:kind,...(kind==='parent'?{parentId:source,childId:target}:{sourceId:source,targetId:target})},value:'',writes:0,getAttribute(){return this.value;},setAttribute(key,value){this.value=value;this.writes++;}});const paths=[path('a','b'),path('b','c'),path('d','root','relation')];const manager=new ConnectionGeometry({getNode:id=>graph.get(id),getSize:id=>sizes.get(id),requestFrame:f=>{requests++;callback=f;return requests;},cancelFrame:()=>{callback=null;}});manager.bind({querySelectorAll:()=>paths});return {manager,paths,sizes,flush:()=>callback?.()};}
test('geometry uses cached sizes and touches only edges connected to changed nodes',()=>{const {manager,paths,sizes,flush}=fixture();assert.deepEqual(paths.map(p=>p.writes),[1,1,1]);sizes.set('a',{width:130,height:40});manager.invalidate(['a']);manager.invalidate(['a']);flush();assert.deepEqual(paths.map(p=>p.writes),[2,1,1]);assert.equal(paths[0].value,connectionPath('parent',nodes[0],nodes[1],sizes.get('a'),sizes.get('b')));});
test('camera transform alone needs no edge recalculation; unchanged paths are not written',()=>{const {manager,paths}=fixture();assert.equal(viewportTransform({x:12,y:-9,zoom:.4}),'translate3d(12px, -9px, 0) scale(0.4)');manager.invalidate();manager.flush();assert.deepEqual(paths.map(p=>p.writes),[1,1,1]);});
test('canceling geometry work does not write stale paths after a canvas switch',()=>{const {manager,paths,sizes,flush}=fixture();sizes.set('a',{width:200,height:40});manager.invalidate(['a']);manager.cancel();flush();assert.equal(paths[0].writes,1);});
const source=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
test('actual camera commits transform immediately without full React renders per input',()=>{let renders=0,phase=0;const world={style:{setProperty(){}}},svg={style:{}},start={x:20,y:20,zoom:.82};const context={startTransition:fn=>fn(),viewportTransform,needsViewportSnapshot,previewEnabled:false,viewportRef:{current:start},viewportSnapshotRef:{current:start},viewportSizeRef:{current:{width:1280,height:720}},semanticPreviewRef:{current:0},worldRef:{current:world},connectionsRef:{current:svg},setPreviewLayoutActive(){phase++;},setPreviewContentPhase(){},setPreviewFullSizes(){},setViewport(){renders++;}};const f=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='commitViewport');vm.createContext(context);vm.runInContext(source.slice(f.start,f.end),context);for(let i=1;i<=36;i++)context.commitViewport({x:20-i*6,y:20-i,zoom:.82},false);assert.equal(renders,0);assert.equal(phase,0);assert.equal(world.style.transform,svg.style.transform);assert.equal(context.viewportRef.current.x,-196);context.commitViewport(context.viewportRef.current,true);assert.equal(renders,1);});

test('high-frequency pan input paints only the latest position once per display frame',async()=>{
  const {LatestFrame}=await import('./camera.mjs');let callback,calls=0;const painted=[];
  const frames=new LatestFrame(value=>painted.push(value),fn=>{callback=fn;calls++;return calls;},()=>{callback=null;});
  for(let i=0;i<200;i++)frames.enqueue({x:i,y:-i});
  assert.equal(calls,1);assert.equal(painted.length,0);callback();assert.deepEqual(painted,[{x:199,y:-199}]);
  frames.enqueue({x:220,y:10});frames.flush();assert.deepEqual(painted.at(-1),{x:220,y:10});assert.equal(callback,null);
  frames.enqueue({x:999,y:999});frames.clear();assert.equal(callback,null);frames.flush();assert.equal(painted.length,2);
});
test('pan release uses release coordinates and flushes the last frame before publishing',()=>{
  const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='endPointer');
  const noop=()=>{};let result,cleared=false;const view={x:20,y:30,zoom:.8};
  const context={endHistory:noop,relationDragRef:{current:null},quickBlankClick:{current:null},panInputRef:{current:{startX:100,startY:100,x:20,y:30,moved:false}},panFramesRef:{current:{enqueue(v){result=v;},flush(){context.viewportRef.current=result;}}},cameraGestureRef:{current:true},targetViewportRef:{current:view},viewportRef:{current:view},commitViewport(v,force){assert.equal(force,true);assert.deepEqual({...v},{x:220,y:80,zoom:.8});},clearSelection(){cleared=true;},closeRootComposer:noop,marquee:null,resizingRef:{current:null},setDragging:noop,setPanning:noop,setMarquee:noop,setResizing:noop};
  vm.createContext(context);vm.runInContext(source.slice(handler.start,handler.end),context);context.endPointer({type:'pointerup',clientX:300,clientY:150});
  assert.equal(context.panInputRef.current,null);assert.equal(context.cameraGestureRef.current,false);assert.equal(cleared,false);
});

test('zoom easing has equal progress at 60Hz, 120Hz and a dropped frame',async()=>{
  const {advanceViewport}=await import('./camera.mjs');const start={x:0,y:0,zoom:1},target={x:100,y:-200,zoom:.3};
  const one=advanceViewport(start,target,1000/60);assert.ok(Math.abs(one.x-20)<1e-9);
  const twice=advanceViewport(advanceViewport(start,target,1000/120),target,1000/120);
  for(const key of ['x','y','zoom'])assert.ok(Math.abs(twice[key]-one[key])<1e-9);
  const dropped=advanceViewport(start,target,1000/30),two=advanceViewport(one,target,1000/60);
  for(const key of ['x','y','zoom'])assert.ok(Math.abs(dropped[key]-two[key])<1e-9);
  const gap=advanceViewport(start,target,10000);assert.ok(gap.zoom>target.zoom&&gap.zoom<start.zoom);
});
test('a wheel burst reads the canvas rect once and preserves the pointer anchor',()=>{
  const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='zoomCanvas');let reads=0,frames=0;
  const context={quickBlankClick:{current:null},wheelRectRef:{current:null},canvasRef:{current:{getBoundingClientRect(){reads++;return{left:10,top:20};}}},targetViewportRef:{current:{x:20,y:30,zoom:1}},zoomFrameRef:{current:null},requestAnimationFrame(){frames++;return frames;},animateViewport(){}};
  vm.createContext(context);vm.runInContext(source.slice(handler.start,handler.end),context);
  const event={clientX:500,clientY:400,deltaY:10,preventDefault(){}};
  for(let i=0;i<40;i++)context.zoomCanvas(event);
  assert.equal(reads,1);assert.equal(frames,1);const end=context.targetViewportRef.current;
  assert.ok(Math.abs((490-end.x)/end.zoom-470)<1e-8);assert.ok(Math.abs((380-end.y)/end.zoom-350)<1e-8);
  context.wheelRectRef.current=null;context.zoomCanvas(event);assert.equal(reads,2);
});
test('camera paints immediately while scene updates may remain deferred',()=>{
  const handler=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='commitViewport');const pending=[];let rendered;
  const start={x:0,y:0,zoom:1};const context={viewportTransform,needsViewportSnapshot,startTransition:fn=>pending.push(fn),previewEnabled:false,viewportRef:{current:start},viewportSnapshotRef:{current:start},viewportSizeRef:{current:{width:1000,height:700}},semanticPreviewRef:{current:0},worldRef:{current:{style:{setProperty(){}}}},connectionsRef:{current:{style:{}}},setPreviewLayoutActive(){},setPreviewContentPhase(){},setPreviewFullSizes(){},setViewport(v){rendered=v;}};
  vm.createContext(context);vm.runInContext(source.slice(handler.start,handler.end),context);const next={x:-800,y:0,zoom:.8};context.commitViewport(next,false);
  assert.equal(rendered,undefined);assert.equal(pending.length,1);assert.equal(context.viewportRef.current,next);assert.equal(context.worldRef.current.style.transform,viewportTransform(next));assert.equal(context.viewportSnapshotRef.current,start);
  pending[0]();assert.equal(rendered,next);
});
