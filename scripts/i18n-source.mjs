import { parse } from '@babel/parser';
import fs from 'node:fs';
export const root = new URL('../', import.meta.url);
export function walk(node, visit, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node, ancestors);
  for (const [key, value] of Object.entries(node)) {
    if (['loc','comments','tokens','errors'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, [...ancestors, node]));
    else if (value && typeof value === 'object') walk(value, visit, [...ancestors, node]);
  }
}
export function template(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral') return node.quasis.map((q,i) => (q.value.cooked || '') + (i < node.expressions.length ? `{${i}}` : '')).join('');
  return null;
}
export function inventory(file = 'src/main.jsx') {
  const source = fs.readFileSync(new URL(file, root), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const calls = [], literals = [], keyed = [];
  walk(ast, (node, parents) => {
    if (node.type === 'CallExpression' && node.callee.name === 'tr') calls.push({ zh: template(node.arguments[0]), en: template(node.arguments[1]), start: node.start, end: node.end, line: node.loc.start.line, expressions: node.arguments[1]?.expressions?.map(n => source.slice(n.start,n.end)) || [] });
    if (node.type === 'VariableDeclarator' && node.id.name === 'UI_COPY') {
      for (const lang of node.init.properties) if (['en','zh-CN'].includes(lang.key.name || lang.key.value)) for (const item of lang.value.properties) keyed.push({language:lang.key.name || lang.key.value,key:item.key.name || item.key.value,value:item.value.value});
    }
    if ((node.type === 'StringLiteral' || node.type === 'TemplateLiteral' || node.type === 'JSXText') && /\p{Script=Han}/u.test(node.type === 'JSXText' ? node.value : template(node) || '') && !parents.some(p => p.type === 'VariableDeclarator' && ['UI_COPY','PHRASE_PACKS','COMPLETE_UI_PACKS'].includes(p.id.name)) && !parents.some(p => p.type === 'CallExpression' && p.callee.name === 'tr') && !parents.some(p => p.type === 'TemplateLiteral')) literals.push({value:node.type === 'JSXText' ? node.value.trim() : template(node), line:node.loc.start.line, start:node.start,end:node.end,type:node.type});
  });
  return {calls,keyed,literals};
}
if (process.argv[1]?.endsWith('i18n-source.mjs')) console.log(JSON.stringify(inventory(),null,2));
