import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentHitsRect,segmentsHit,removeSliceRecords,sliceBackups,flattenCubic,createSliceIndex} from './slice.js';
test('slicing detects fast movement crossing a card even with both samples outside',()=>{
 const r={left:100,top:100,right:200,bottom:200};
 assert.ok(segmentHitsRect({x:0,y:150},{x:300,y:150},r));
 assert.ok(segmentHitsRect({x:300,y:150},{x:0,y:150},r));
 assert.ok(!segmentHitsRect({x:0,y:99},{x:300,y:99},r));
 assert.ok(segmentHitsRect({x:150,y:150},{x:150,y:150},r));
});
test('cutting lines handles crossing, tangency, collinear overlap and misses',()=>{
 const a={x:0,y:0},b={x:100,y:100};
 assert.ok(segmentsHit(a,b,{x:0,y:100},{x:100,y:0}));
 assert.ok(segmentsHit(a,b,{x:30,y:30},{x:70,y:70}));
 assert.ok(!segmentsHit(a,b,{x:105,y:105},{x:200,y:200}));
 assert.ok(segmentsHit({x:0,y:10},{x:100,y:10},{x:50,y:12},{x:60,y:12}));
});
test('one stroke cuts ideas and all link formats, keeps descendants and undo restores survivor relations',()=>{
 const nodes=[{id:'a',type:'thought'},{id:'b',type:'thought',parentId:'a',links:['c'],relations:[{targetId:'c',type:'reference'},{targetId:'d',type:'merge'}]},{id:'c',type:'thought'},{id:'d',type:'thought',parentId:'b'},{id:'chat',type:'conversation',parentId:'a',content:'keep'}];
 const ids=new Set(['a']),links=[{kind:'relation',sourceId:'b',targetId:'c',type:'reference'},{kind:'parent',childId:'d'}];
 const result=removeSliceRecords(nodes,ids,links);assert.equal(result.length,4);assert.equal(result[0].parentId,null);assert.deepEqual(result[0].links,[]);assert.deepEqual(result[0].relations,[{targetId:'d',type:'merge'}]);assert.equal(result[2].parentId,null);assert.equal(result[3].content,'keep');
 const backups=sliceBackups(nodes,ids,links);assert.equal(backups.length,3);
 for(const backup of backups)assert.deepEqual(JSON.parse(JSON.stringify({...result.find(n=>n.id===backup.id),...backup})),nodes.find(n=>n.id===backup.id));
 assert.equal(nodes[1].parentId,'a');
});

test('cached spatial index matches exhaustive hit tests for curved links and cards',()=>{
 const cards=Array.from({length:100},(_,i)=>({id:`c${i}`,rect:{left:(i%10)*300-200,top:Math.floor(i/10)*150-100,right:(i%10)*300+24,bottom:Math.floor(i/10)*150+10}}));
 const links=Array.from({length:30},(_,i)=>({connection:{key:`l${i}`},points:flattenCubic([{x:i*50,y:0},{x:i*50+200,y:300},{x:i*50-100,y:500},{x:i*50+100,y:700}])}));
 const index=createSliceIndex(cards,links);
 for(let i=0;i<50;i++) {
  const a={x:(i*173)%2500-100,y:(i*127)%1500-100},b={x:(i*379)%2500-100,y:(i*251)%1500-100};
  const ids=new Set(),hits=new Map();index.query(a,b,ids,hits);
  assert.deepEqual([...ids].sort(),cards.filter(c=>segmentHitsRect(a,b,c.rect)).map(c=>c.id).sort());
  assert.deepEqual([...hits.keys()].sort(),links.filter(l=>l.points.some((p,j)=>j&&segmentsHit(a,b,l.points[j-1],p))).map(l=>l.connection.key).sort());
 }
});
test('spatial lookup avoids visiting distant shapes and clips offscreen index bounds',()=>{
 const cards=Array.from({length:1000},(_,i)=>({id:`c${i}`,rect:{left:i*300,top:0,right:i*300+224,bottom:110}}));
 const index=createSliceIndex(cards,[]);const ids=new Set();
 assert.ok(index.query({x:-10,y:50},{x:250,y:50},ids,new Map())<5);assert.deepEqual([...ids],['c0']);
 const bounded=createSliceIndex(cards,[],128,{left:0,top:0,right:1280,bottom:720});const clipped=new Set();bounded.query({x:299500,y:50},{x:300500,y:50},clipped,new Map());assert.equal(clipped.size,0);
});
