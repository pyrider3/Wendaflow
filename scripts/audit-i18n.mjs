import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { inventory, walk, root } from './i18n-source.mjs';
import { buildCatalog, locales, translate, localizeKnown, formatTemplate } from '../src/i18n/catalog.mjs';
import sourceIndex from '../src/i18n/source-index.json' with { type:'json' };
const source = fs.readFileSync(new URL('src/main.jsx',root),'utf8');
const objects = {};
walk(parse(source,{sourceType:'module',plugins:['jsx']}),node => {
  if (node.type === 'VariableDeclarator' && ['UI_COPY','PHRASE_PACKS','COMPLETE_UI_PACKS'].includes(node.id.name)) objects[node.id.name] = vm.runInNewContext('(' + source.slice(node.init.start,node.init.end) + ')',Object.create(null),{timeout:1000});
});
const catalog = buildCatalog(objects.UI_COPY,objects.PHRASE_PACKS,objects.COMPLETE_UI_PACKS);
const scan = inventory();
const required = new Set([...scan.calls.filter(call => call.en !== null).map(call => call.en),...Object.values(objects.UI_COPY.en),...sourceIndex.map(([,en])=>en)]);
const placeholders = value => [...String(value).matchAll(/\{(\d+)\}/g)].map(m=>m[1]).sort().join(',');
let failures = 0;
const css = fs.readFileSync(new URL('src/styles.css',root),'utf8');
if (/content\s*:\s*['"][^'"\n]*\p{Script=Han}/u.test(css)) { console.error('Hardcoded translated text in CSS'); failures++; }
// The keyed dispatcher is the only intentional dynamic translation call.
for (const call of scan.calls.filter(c=>c.en===null)) if (source.slice(call.start,call.end)!=="tr(UI_COPY['zh-CN'][key],english)") { console.error('Unverifiable translation call',call.line);failures++; }
for (const literal of scan.literals.filter(l=>l.type==='JSXText')) { console.error('Untranslated visible text',literal.line,literal.value);failures++; }
for (const locale of locales) {
  const missing = [...required].filter(key => !Object.hasOwn(catalog[locale],key));
  const invalid = [...required].filter(key => catalog[locale][key] && placeholders(key) !== placeholders(catalog[locale][key]));
  failures += missing.length + invalid.length;
  console.log(locale + ': ' + (required.size - missing.length) + '/' + required.size + ' translated; ' + invalid.length + ' invalid placeholders');
  if (missing.length) console.log('MISSING', JSON.stringify(missing));
  if (invalid.length) console.log('INVALID',JSON.stringify(invalid));
  const dynamic = translate(catalog,locale,'已刪除 12 個節點','12 nodes deleted');
  if (!dynamic.includes('12') || dynamic === '12 nodes deleted') { console.error('Dynamic translation failed:',locale); failures++; }
  for (const key of required) {
    if (!catalog[locale][key] || !/\{\d+\}/.test(key)) continue;
    const params = ['VALUE_0','VALUE_1','VALUE_2','VALUE_3','VALUE_4'];
    const expected = formatTemplate(catalog[locale][key],params);
    if (translate(catalog,locale,'test',formatTemplate(key,params)) !== expected) { console.error('Template lookup failed',locale,key); failures++; }
  }
  const connected = localizeKnown(catalog,locale,'已连接 · 检测到 12 个模型');
  if (connected !== formatTemplate(catalog[locale]['Connected · {0} models detected'],['12'])) {console.error('Stored status translation failed',locale);failures++;}
  if (localizeKnown(catalog,'zh-CN',connected) !== '已连接 · 检测到 12 个模型') {console.error('Return to Chinese failed',locale);failures++;}
  const userContent='User content: 中文 / 日本語 / العربية';
  if(localizeKnown(catalog,locale,userContent)!==userContent){console.error('Unrecognized content was changed');failures++;}
}
if (failures) { console.error('Localization audit failed: ' + failures + ' problems.'); process.exitCode = 1; }
else console.log('All shipped locales cover every keyed label and tr() phrase. No missing keys or placeholders.');
