// One-time migration: returns an apply_patch patch, never writes application files.
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {walk,template,root} from './i18n-source.mjs';
const path = new URL('src/main.jsx',root);
const source = fs.readFileSync(path,'utf8');
const map = JSON.parse(fs.readFileSync(new URL('scripts/localization-replacements.json',root),'utf8'));
const edits=[];
walk(parse(source,{sourceType:'module',plugins:['jsx']}),(node,parents)=>{
 if (!['StringLiteral','TemplateLiteral','JSXText'].includes(node.type)) return;
 if(parents.some(p=>p.type==='VariableDeclarator'&&['UI_COPY','PHRASE_PACKS','COMPLETE_UI_PACKS','UI_LANGUAGES','NODE_COLORS','DEFAULT_OLLAMA'].includes(p.id.name)))return;
 if(parents.some(p=>p.type==='CallExpression'&&p.callee.name==='tr')||parents.some(p=>p.type==='TemplateLiteral'))return;
 const key=node.type==='JSXText'?node.value.trim():template(node);
 if(!Object.hasOwn(map,key))return;
 // Keep merge identifiers stable. Translate their labels at render time.
 if(key==='综合结论'||['并列比较','找出冲突','制定行动'].includes(key))return;
 let en=JSON.stringify(map[key]);
 if(node.type==='TemplateLiteral')en='`'+map[key].replace(/\{(\d+)\}/g,(_,i)=>'${'+source.slice(node.expressions[i].start,node.expressions[i].end)+'}')+'`';
 const original=node.type==='JSXText'?JSON.stringify(key):source.slice(node.start,node.end);
 let value='tr('+original+','+en+')';
 if(node.type==='JSXText'||parents.at(-1)?.type==='JSXAttribute')value='{'+value+'}';
 edits.push({start:node.start,end:node.end,value});
});
let next=source;for(const e of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,e.start)+e.value+next.slice(e.end);
const before=source.split(/\r?\n/),after=next.split(/\r?\n/);
if(before.length!==after.length)throw Error('Line count changed');
const hunks=[];for(let i=0;i<before.length;i++)if(before[i]!==after[i])hunks.push('@@\n-'+before[i]+'\n+'+after[i]);
console.log(JSON.stringify('*** Begin Patch\n*** Update File: '+path.pathname.replace(/^\//,'')+'\n'+hunks.join('\n')+'\n*** End Patch'));
