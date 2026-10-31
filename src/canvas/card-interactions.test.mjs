import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {canEditCard,pastedCardNodes,cardIds} from '../cards/interaction-policy.mjs';
import {boxThoughtIds,attachThoughtChild,newThought} from '../quick-thought/ideas.js';
import {connectionIntent} from '../quick-thought/interactions.mjs';
const src=fs.readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
const app=parse(src,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='App');
function actual(name,context){const n=app.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);vm.createContext(context);vm.runInContext(src.slice(n.start,n.end),context);return context[name];}
const noop=()=>{};
test('AI output cannot enter either editor or be overwritten by a stale save',()=>{
 for(const type of ['conversation','action']){
  const node={id:'ai',type};let changed=false;
  const ctx={canEditCard,selected:node,setNodes:()=>changed=true,setEditingNode:()=>changed=true,setEditDraft:()=>changed=true};
  actual('startEditingNode',ctx)(node);
  assert.equal(actual('saveNodeEdit',ctx)(),false);assert.equal(changed,false);
 }
 assert.equal(canEditCard({type:'thought'}),true);
});
test('thought and AI cards can link both ways while preserving cycle prevention',()=>{
 const a={id:'a',type:'thought'}, b={id:'b',type:'conversation'};
 for(const nodes of [[a,b],[b,a]]){
  assert.equal(connectionIntent(nodes,nodes[0].id,nodes[1].id),'connect');
  const next=attachThoughtChild(nodes,nodes[0].id,nodes[1].id);
  assert.equal(next[1].parentId,next[0].id);
  assert.equal(attachThoughtChild(next,next[1].id,next[0].id),next);
 }
});
test('quick selection includes a touched AI card when operating on all card types',()=>{
 const nodes=[{id:'ai',type:'conversation',x:10,y:10}];
 assert.deepEqual(boxThoughtIds(nodes,new Map([['ai',{width:200,height:100}]]),{x:0,y:0,zoom:1},{startX:200,startY:100,x:250,y:150,allCards:true}),['ai']);
 assert.deepEqual([...cardIds(nodes,new Set(['ai','gone']))],['ai']);
});
test('clipboard node payload is distinguished from ordinary text',()=>{
 assert.equal(pastedCardNodes('text'),null);
 assert.equal(pastedCardNodes('{"type":"other","nodes":[]}'),null);
 assert.deepEqual(pastedCardNodes('{"type":"wonderful-nodes","nodes":[{"id":"ai","type":"conversation"}]}'),[{id:'ai',type:'conversation'}]);
});
function attachmentContext(nodes,targetId){let current=nodes;let history=0,editor;const ctx={editingNode:null,quickThought:true,setQuickEditor:value=>editor=typeof value==='function'?value(editor||ctx.quickEditor):value,questionTitle:s=>s,activeCanvasIdRef:{current:'canvas'},quickEditor:null,selectedIds:new Set(targetId?[targetId]:[]),selectedId:targetId,canEditCard,graph:{byId:new Map(nodes.map(n=>[n.id,n]))},canvasRef:{current:{getBoundingClientRect:()=>({width:800,height:600})}},viewportRef:{current:{x:0,y:0,zoom:1}},addAttachmentFiles:async()=>[{id:'image',name:'image.png',dataUrl:'data:image/png;base64,test'}],beginHistory:()=>history++,endHistory:()=>history--,currentNodes:()=>current,setNodes:f=>current=f(current),setSelectedId:noop,setSelectedIds:noop,setInspectorOpen:noop,newThought,crypto:{randomUUID:()=> 'unique'},tr:s=>s,say:s=>s,setStorageWarning:message=>{throw new Error(message);}};return {ctx,nodes:()=>current,history:()=>history,editor:()=>editor};}
test('quick image paste appends to a selected idea without opening the composer',async()=>{
 const state=attachmentContext([{id:'idea',type:'thought',title:'Title',content:'Body',attachments:[]}],'idea');
 await actual('pasteQuickAttachments',state.ctx)([]);
 assert.equal(state.nodes().length,1);assert.equal(state.nodes()[0].title,'Title');assert.equal(state.nodes()[0].attachments[0].id,'image');assert.equal(state.history(),0);
});
test('quick image paste beside an AI card creates a new image idea without rewriting AI content',async()=>{
 const state=attachmentContext([{id:'ai',type:'conversation',content:'Original'}],'ai');
 await actual('pasteQuickAttachments',state.ctx)([]);
 assert.equal(state.nodes().length,2);assert.equal(state.nodes()[0].content,'Original');assert.equal(state.nodes()[1].type,'thought');assert.equal(state.nodes()[1].attachments[0].id,'image');
});
test('image conversion completing after switching canvas cannot insert into another canvas',async()=>{
 const state=attachmentContext([],null);
 state.ctx.addAttachmentFiles=async()=>{state.ctx.activeCanvasIdRef.current='other';return [{id:'image'}];};
 await actual('pasteQuickAttachments',state.ctx)([]);assert.equal(state.nodes().length,0);
});

test('quick mode copies generated cards without filtering them out',async()=>{
 const ctx={nodes:[{id:'ai',type:'conversation',title:'Answer'}],selectedIds:new Set(['ai']),quickThought:true,nodeClipboardRef:{current:null},navigator:{clipboard:{writeText:async()=>{}}},notify:noop,tr:s=>s};
 await actual('copySelectedNodes',ctx)();assert.equal(ctx.nodeClipboardRef.current.length,1);assert.equal(ctx.nodeClipboardRef.current[0].type,'conversation');
});

test('pasting an image creates a blank caption and focuses its editor without the filename',async()=>{
 const state=attachmentContext([],null);await actual('pasteQuickAttachments',state.ctx)([]);
 const node=state.nodes()[0];assert.equal(node.title,'');assert.equal(node.content,'');assert.equal(state.editor().id,node.id);assert.equal(state.editor().value,'');assert.equal(state.editor().created,false);
});
test('pasting onto a manually sized idea keeps its width and releases height to show the image',async()=>{
 const state=attachmentContext([{id:'idea',type:'thought',title:'Note',content:'',manualWidth:350,manualHeight:44,attachments:[]}],'idea');
 await actual('pasteQuickAttachments',state.ctx)([]);assert.equal(state.nodes()[0].manualWidth,350);assert.equal(state.nodes()[0].manualHeight,undefined);assert.equal(state.editor().value,'Note');
});
test('pasting into an empty newly created editor retains the target and its position instead of cancelling it',async()=>{
 const node={id:'empty',type:'thought',title:'新想法',content:'',x:25,y:40,attachments:[]};const state=attachmentContext([node],'empty');state.ctx.quickEditor={id:'empty',value:'',created:true};state.ctx.saveQuickIdea=()=>assert.fail('Must not complete and delete the empty editor before paste');
 await actual('pasteQuickAttachments',state.ctx)([]);assert.equal(state.nodes().length,1);assert.equal(state.nodes()[0].id,'empty');assert.equal(state.nodes()[0].x,25);assert.equal(state.nodes()[0].y,40);assert.equal(state.editor().id,'empty');assert.equal(state.editor().value,'');assert.equal(state.editor().created,false);
});
