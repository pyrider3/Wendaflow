import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse} from '@babel/parser';
import {isTemporaryCanvas,durableCanvasIndex,mergeCanvases,loadLibrary,writeLibrary,openLibraryTab,visibleLibraryTabs,queryLibrary,summarizeCanvas,duplicateCanvasState,LIBRARY_KEY} from './library.mjs';
import {storedZip,crc32} from './zip.mjs';
const storage=(data=null)=>({getItem:()=>data,setItem:(_key,value)=>data=value});
test('legacy open and closed canvases merge without overwriting open metadata or discarding content ids',()=>{assert.deepEqual(mergeCanvases([{id:'a',name:'current'}],[{id:'a',name:'old'},{id:'b',name:'closed',closedAt:'old'}]).map(c=>c.name),['current','closed']);const meta=loadLibrary(storage(),[{id:'a'},{id:'b',closedAt:'old'}]);assert.deepEqual(meta.openTabs,['a']);});
test('stars, groups, closed tabs and recovery metadata survive storage round trip',()=>{const value={version:1,cards:{a:{starred:true,groupId:'g'},b:{trashedAt:'now'}},groups:[{id:'g',name:'项目'}],openTabs:[],sidebar:false};const s=storage();writeLibrary(s,value);const read=loadLibrary(s,[{id:'a'},{id:'b'}]);assert.deepEqual(read,value);assert.equal(queryLibrary([{id:'a',name:'one',...read.cards.a},{id:'b',name:'two',...read.cards.b}],{filter:'trash'}).length,1);});
test('failed metadata writes throw before a success value can be committed',()=>{const state={openTabs:['a']};assert.throws(()=>writeLibrary({setItem:()=>{throw new Error('quota');}},state),/quota/);assert.deepEqual(state.openTabs,['a']);});
test('tab overflow always includes active canvas and opening a tab keeps unique stable order',()=>{const items=Array.from({length:9},(_,i)=>({id:String(i)}));const result=visibleLibraryTabs(items,'0',3);assert.equal(result.length,3);assert.ok(result.some(c=>c.id==='0'));const meta=openLibraryTab({openTabs:['a'],cards:{}},'a','now');assert.deepEqual(meta.openTabs,['a']);assert.equal(meta.cards.a.lastOpenedAt,'now');});
test('search, favorite, group and trash filters do not mix deleted canvases into normal results',()=>{const items=[{id:'a',name:'研究计划',starred:true,groupId:'g',updatedAt:'2026-02'},{id:'b',name:'研究资料',trashedAt:'x',updatedAt:'2026-03'},{id:'c',name:'草稿',updatedAt:'2026-01'}];assert.deepEqual(queryLibrary(items,{query:'研究'}).map(c=>c.id),['a']);assert.deepEqual(queryLibrary(items,{filter:'group:g'}).map(c=>c.id),['a']);assert.deepEqual(queryLibrary(items,{filter:'starred'}).map(c=>c.id),['a']);assert.deepEqual(queryLibrary(items,{filter:'trash'}).map(c=>c.id),['b']);});
test('layout previews contain no attachment bodies and cap mounted preview geometry',()=>{const s=summarizeCanvas({nodes:Array.from({length:200},(_,i)=>({id:String(i),x:i,y:i,attachments:[{dataUrl:'private'}]}))});assert.equal(s.count,200);assert.equal(s.nodes.length,70);assert.equal(s.nodes[0].attachments,undefined);});
test('ZIP exports use UTF8 names and correct CRC and central directory offsets',async()=>{const content=new TextEncoder().encode('hello');assert.equal(crc32(content),0x3610a686);const blob=storedZip([{name:'研究.wdf',data:'hello'}]);const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);const nameLength=view.getUint16(26,true);assert.equal(new TextDecoder().decode(bytes.slice(30,30+nameLength)),'研究.wdf');const end=bytes.length-22,central=view.getUint32(end+16,true);assert.equal(view.getUint32(central,true),0x02014b50);assert.equal(view.getUint32(central+16,true),crc32(content));assert.equal(view.getUint16(end+8,true),1);});
const src=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8'),app=parse(src,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
function actual(name,ctx){if(name==='closeCanvas')Object.assign(ctx,{workspaceBusyRef:{current:false},canvasCloseQueueRef:{current:Promise.resolve()},canvasSavesRef:{current:new Map()},canvasesRef:{current:['a','b','c','d'].map(id=>({id,temporary:false}))},activeCanvasIdRef:{current:ctx.activeCanvasId||'a'},autosavePolicyRef:{current:{}},isTemporaryCanvas,setCanvasManagementOpen:()=>{}});if(['persistCurrentCanvas','saveCanvas'].includes(name)){ctx.discardedCanvasIdsRef??={current:new Set()};ctx.activeCanvasId??='a';}const f=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);vm.createContext(ctx);vm.runInContext(src.slice(f.start,f.end),ctx);return ctx[name];}
test('closing the final tab preserves the canvas and opens the library instead of deleting data',async()=>{let meta={openTabs:['a'],cards:{}},home=false;const ctx={persistCurrentCanvas:async()=>{},workspaceMetaRef:{current:meta},changeWorkspace:update=>{meta=update(meta);return true;},activeCanvasId:'a',setCanvasMenuOpen:v=>home=v,setStorageWarning:()=>{},switchCanvas:()=>assert.fail('No other tab to switch to')};await actual('closeCanvas',ctx)('a');assert.equal(meta.openTabs.length,0);assert.equal(home,true);});
test('a failed pre-close save keeps tab and selected canvas in place',async()=>{let changed=false;const ctx={persistCurrentCanvas:async()=>{throw new Error('blocked');},setStorageWarning:()=>{},changeWorkspace:()=>changed=true};await actual('closeCanvas',ctx)('a');assert.equal(changed,false);});
test('current canvas exports directly from memory without depending on IndexedDB',async()=>{let file;const ctx={quickEditor:null,currentNodes:()=>[{id:'a',type:'thought',x:0,y:0}],selectedId:'a',collapsedIds:new Set(),targetViewportRef:{current:{x:1,y:2,zoom:1}},activeCanvasId:'canvas',canvases:[{id:'canvas',name:'Title'}],readCanvasState:()=>assert.fail('Current canvas must not require disk'),downloadWorkspaceFile:(data,name)=>file={data,name},setStorageWarning:message=>assert.fail(message),say:s=>s};assert.equal(await actual('exportCanvases',ctx)(['canvas']),true);assert.equal(JSON.parse(file.data).nodes[0].id,'a');});

test('a new canvas cannot start another creation while persistence is still pending',async()=>{
 const ctx={workspaceBusyRef:{current:true},setWorkspaceBusy:()=>assert.fail('Existing request owns busy state')};await actual('createCanvas',ctx)();
});
test('failed new-canvas persistence releases the input lock without creating a phantom canvas',async()=>{
 const states=[],ctx={workspaceBusyRef:{current:false},setWorkspaceBusy:value=>states.push(value),crypto:{randomUUID:()=> 'new'},canvases:[],tr:s=>s,transitionRequestRef:{current:0},persistCurrentCanvas:async()=>{throw new Error('storage unavailable');},setStorageWarning:()=>{},writeCanvasState:()=>assert.fail('Creation should stop before writing new canvas')};
 await actual('createCanvas',ctx)();assert.deepEqual(states,[true,false]);assert.equal(ctx.workspaceBusyRef.current,false);
});

test('duplicating a canvas remaps every internal relation and does not carry live generation jobs',()=>{
 const source={nodes:[{id:'a',type:'conversation',status:'streaming',content:'partial',attachments:[{id:'image',dataUrl:'data:test'}]},{id:'b',type:'thought',parentId:'a',links:['a'],relations:[{id:'r',targetId:'a',type:'reference'}]}],selectedId:'b',collapsedIds:['a'],viewport:{x:1,y:2,zoom:1}};let i=0;const copy=duplicateCanvasState(source,()=>String(i++));assert.equal(copy.nodes[0].status,'stopped');assert.equal(copy.nodes[0].content,'partial');assert.equal(copy.nodes[1].parentId,'0');assert.deepEqual(copy.nodes[1].links,['0']);assert.equal(copy.nodes[1].relations[0].targetId,'0');assert.equal(copy.selectedId,'1');assert.deepEqual(copy.collapsedIds,['0']);assert.notEqual(copy.nodes[0].attachments,source.nodes[0].attachments);assert.equal(source.nodes[0].status,'streaming');
});

test('closing an active middle or last tab chooses an adjacent tab, not the last unrelated tab',async()=>{
 for(const [active,expected] of [['b','c'],['d','c'],['a','b']]){
  let meta={openTabs:['a','b','c','d'],cards:{}},opened;
  const ctx={persistCurrentCanvas:async()=>{},workspaceMetaRef:{current:meta},changeWorkspace:update=>{meta=update(meta);return true;},activeCanvasId:active,setCanvasMenuOpen:()=>{},setStorageWarning:message=>assert.fail(message),switchCanvas:async id=>opened=id};
  await actual('closeCanvas',ctx)(active);assert.equal(opened,expected);assert.ok(!meta.openTabs.includes(active));
 }
});
test('trashing the active canvas keeps the manager open without opening or creating any canvas',async()=>{
 let meta={openTabs:['a','b'],cards:{}},home=false;
 const ctx={persistCurrentCanvas:async()=>{},workspaceMetaRef:{current:meta},changeWorkspace:update=>{meta=update(meta);ctx.workspaceMetaRef.current=meta;return true;},activeCanvasId:'a',canvases:[{id:'a'},{id:'b'}],setCanvasMenuOpen:value=>home=value,setStorageWarning:message=>assert.fail(message),switchCanvas:()=>assert.fail('Must not switch automatically'),createCanvas:()=>assert.fail('Must not create automatically')};
 assert.equal(await actual('moveCanvasesToTrash',ctx)(['a','b']),true);assert.equal(home,true);assert.equal(meta.openTabs.length,0);assert.ok(meta.cards.a.trashedAt);assert.ok(meta.cards.b.trashedAt);
});
test('reopening the current canvas explicitly restores its tab before closing the manager',async()=>{
 let home=true,meta={openTabs:[],cards:{}};
 const ctx={workspaceBusyRef:{current:false},window:{innerWidth:1000},activeCanvasId:'a',changeWorkspace:update=>{meta=update(meta);return true;},openLibraryTab,setCanvasMenuOpen:value=>home=value};
 assert.equal(await actual('switchCanvas',ctx)('a'),true);assert.deepEqual(Array.from(meta.openTabs),['a']);assert.equal(home,false);
});

test('switching away from an unsaved canvas keeps only its session draft until manual save enables persistence',async()=>{
 let writes=0;const nodes=[{id:'n',title:'draft'}];const ctx={editingNode:null,foldTimerRef:{},closeTimerRef:{},inspectorTimerRef:{},quickEditor:null,endHistory:()=>{},activeCanvasIdRef:{current:'a'},currentNodes:()=>nodes,canvasWriteQueueRef:{current:new Map()},selectedId:'n',collapsedIds:new Set(),targetViewportRef:{current:{x:0,y:0,zoom:1}},canvasDraftsRef:{current:new Map()},autosavePolicyRef:{current:{}},writeCanvasState:async()=>writes++};
 const persist=actual('persistCurrentCanvas',ctx);await persist();assert.equal(writes,0);assert.equal(ctx.canvasDraftsRef.current.get('a').nodes,nodes);ctx.autosavePolicyRef.current.a=true;await persist();assert.equal(writes,1);
});
test('silent saves cannot activate autosave or finish an editor before the first manual save',async()=>{
 const ctx={autosavePolicyRef:{current:{}},activeCanvasId:'a',quickEditor:{id:'n'},saveQuickIdea:()=>assert.fail('Silent save must not finish an unsaved editor'),setSaveStatus:()=>assert.fail('Silent save must not announce a save')};
 await actual('saveCanvas',ctx)(true);
});
test('autosave activation is per canvas and commits only after its preference is stored',()=>{
 let stored;const ctx={autosavePolicyRef:{current:{a:true}},localStorage:{setItem:(_key,value)=>stored=value},setAutosavePolicy:()=>{}};actual('enableCanvasAutosave',ctx)('b');assert.equal(JSON.parse(stored).b,true);assert.equal(ctx.autosavePolicyRef.current.a,true);
 const previous=ctx.autosavePolicyRef.current;ctx.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>actual('enableCanvasAutosave',ctx)('c'),/quota/);assert.equal(ctx.autosavePolicyRef.current,previous);assert.equal(previous.c,undefined);
});
test('a manual save cannot enable autosave while the current inline edit is invalid',async()=>{
 let called=false;const ctx={editingNode:'idea',saveNodeEdit:()=>false,enableCanvasAutosave:()=>called=true,writeCanvasState:()=>called=true};await actual('saveCanvas',ctx)(false);assert.equal(called,false);
});

const placeholder={nodes:[],selectedId:null,collapsedIds:[],viewport:{x:20,y:20,zoom:.9}};
test('temporary lifecycle protects saved, imported and legacy content',()=>{
 assert.equal(isTemporaryCanvas({id:'a',temporary:true}),true);
 for(const canvas of [{id:'a',temporary:false},{id:'a',savedAt:'now'},{id:'a',closedAt:'now'}])assert.equal(isTemporaryCanvas(canvas,{},placeholder),false);
 assert.equal(isTemporaryCanvas({id:'a',temporary:true},{a:true}),false);
 assert.equal(isTemporaryCanvas({id:'a',name:'新画布 1'},{},placeholder),true);
 assert.equal(isTemporaryCanvas({id:'a',name:'新画布 1'},{},{...placeholder,nodes:[{id:'n'}]}),false);
 assert.equal(isTemporaryCanvas({id:'a',name:'新画布 1'},{},{...placeholder,format:'branchspace-wdf'}),false);
});
test('durable index excludes unsaved drafts and discarded ids',()=>{
 const result=durableCanvasIndex([{id:'draft',temporary:true},{id:'saved',temporary:true},{id:'import',temporary:false},{id:'deleted'}],'draft',{saved:true},new Set(['deleted']));
 assert.deepEqual(result.canvases.map(c=>c.id),['saved','import']);assert.equal(result.activeId,'import');
});
test('discarding a draft removes its catalog, tab, metadata and cached state without trash',async()=>{
 let catalog=[{id:'a',temporary:true},{id:'b',temporary:false}],meta={openTabs:['a','b'],cards:{a:{starred:true},b:{}}},deleted;
 const ctx={autosavePolicyRef:{current:{}},canvasesRef:{current:catalog},workspaceMetaRef:{current:meta},discardedCanvasIdsRef:{current:new Set()},activeCanvasIdRef:{current:'a'},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},CANVAS_INDEX_KEY:'index',durableCanvasIndex,writeLibrary:()=>{},currentNodes:()=>[],canvasDraftsRef:{current:new Map([['a',{nodes:[]}]])},generationRef:{current:new Map()},setCanvases:value=>catalog=value,setWorkspaceMeta:value=>meta=value,setCanvasSummaries:fn=>fn({a:{}}),setClosedCanvases:fn=>fn([]),canvasWriteQueueRef:{current:new Map()},deleteCanvasState:async id=>deleted=id,setStorageWarning:message=>assert.fail(message),say:s=>s};
 assert.equal(await actual('discardTemporaryCanvas',ctx)('a'),true);assert.deepEqual(catalog.map(c=>c.id),['b']);assert.deepEqual(Array.from(meta.openTabs),['b']);assert.equal(meta.cards.a,undefined);assert.equal(deleted,'a');assert.equal(ctx.canvasDraftsRef.current.has('a'),false);assert.ok(ctx.discardedCanvasIdsRef.current.has('a'));
});
test('failed draft metadata persistence preserves the draft',async()=>{
 const catalog=[{id:'a',temporary:true}],ctx={autosavePolicyRef:{current:{}},canvasesRef:{current:catalog},workspaceMetaRef:{current:{openTabs:['a'],cards:{}}},discardedCanvasIdsRef:{current:new Set()},activeCanvasIdRef:{current:'a'},localStorage:{getItem:()=>null,setItem:()=>{throw Error('quota')},removeItem:()=>{}},CANVAS_INDEX_KEY:'index',durableCanvasIndex,setStorageWarning:()=>{},say:s=>s};
 assert.equal(await actual('discardTemporaryCanvas',ctx)('a'),false);assert.equal(ctx.canvasesRef.current,catalog);assert.equal(ctx.discardedCanvasIdsRef.current.size,0);
});
