import test from 'node:test';
import assert from 'node:assert/strict';
import {pickerChoices} from './picker.mjs';

test('default picker is short and recent, while a search includes older canvases beyond the short list',()=>{
 const items=Array.from({length:12},(_,i)=>({id:String(i),name:'画布 '+i,updatedAt:new Date(2026,0,i+1).toISOString()}));
 assert.equal(pickerChoices(items).length,8);assert.equal(pickerChoices(items)[0].id,'11');assert.equal(pickerChoices(items,'画布 0')[0].id,'0');
});
test('picker search ranks exact, prefix, contained and ordered fuzzy matches and excludes trash',()=>{
 const items=[{id:'fuzzy',name:'Working document flow'},{id:'contained',name:'My wdf notes'},{id:'prefix',name:'wdf notes'},{id:'exact',name:'WDF'},{id:'trash',name:'wdf',trashedAt:'now'}];
 assert.deepEqual(pickerChoices(items,'wdf').map(c=>c.id),['exact','prefix','contained','fuzzy']);assert.equal(pickerChoices(items,'unmatched').length,0);
});
test('whitespace-only search retains recent ordering and does not mutate source records',()=>{
 const items=[{id:'a',name:'早',updatedAt:'2026-01'},{id:'b',name:'晚',updatedAt:'2026-02'}],copy=JSON.stringify(items);
 assert.deepEqual(pickerChoices(items,'  ').map(c=>c.id),['b','a']);assert.equal(JSON.stringify(items),copy);
});
