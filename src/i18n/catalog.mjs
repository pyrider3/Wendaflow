import common from './common.mjs';
import actions from './actions.mjs';
import settings from './settings.mjs';
import workflow from './workflow.mjs';
import sourceIndex from './source-index.json' with { type: 'json' };

export const locales = ['zh-TW','ja','ko','es','fr','de','pt-BR','ru','ar'];
const aliases = {
  'Delete link':'Delete links', 'Create branch from here':'Branch from here',
  merge:'Merge', reference:'Reference', inherit:'Inherit', attachments:'Attachments',
  '★ Favorited':'Favorite', '☆ Favorite':'Favorite', '✓ Completed':'Completed', '✓ Complete':'Done',
};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function compileTemplate(value) {
  const indexes = []; let offset = 0; let source = '^';
  for (const match of value.matchAll(/\{(\d+)\}/g)) { source += escapeRegex(value.slice(offset, match.index)) + '([\\s\\S]*?)'; indexes.push(Number(match[1])); offset = match.index + match[0].length; }
  return { regex: new RegExp(source + escapeRegex(value.slice(offset)) + '$'), indexes };
}
export function formatTemplate(value, params) { return value.replace(/\{(\d+)\}/g, (match,index) => params[Number(index)] === undefined ? match : String(params[Number(index)])); }
export function buildCatalog(copy, phrases, complete, extras = []) {
  const catalog = Object.fromEntries(locales.map(locale => [locale, {}]));
  for (const locale of locales) {
    for (const [key,value] of Object.entries(copy[locale] || {})) if (copy.en[key]) catalog[locale][copy.en[key]] = value;
    Object.assign(catalog[locale], phrases[locale], complete[locale]);
  }
  for (const section of [common,actions,settings,workflow,...extras]) for (const line of section.split('\n').filter(line => line.trim())) {
    const row = line.split('|');
    if (row.length !== locales.length + 1 || row.some(value => !value.trim())) throw new Error(`Invalid localization row: ${row[0]}`);
    locales.forEach((locale,index) => { catalog[locale][row[0]] = row[index+1]; });
  }
  for (const locale of locales) {
    for (const [alias,target] of Object.entries(aliases)) if (catalog[locale][target]) catalog[locale][alias] = (alias.match(/^[★☆✓] /)?.[0] || '') + catalog[locale][target];
    catalog[locale].Wendaflow = 'Wendaflow';
  }
  return catalog;
}
const templateCache = new WeakMap();
const sourceCache = new WeakMap();
// Only for app-owned status/error fields, never for user content or model replies.
export function localizeKnown(catalog, locale, value) {
  if (!value || typeof value !== 'string') return value;
  if (!sourceCache.has(catalog)) {
    const exact = new Map(), patterns = [];
    for (const [zh,en] of sourceIndex) {
      for (const phrase of new Set([zh,en,...locales.map(lang=>catalog[lang][en]).filter(Boolean)])) {
        const rule = {zh,en};
        if (/\{\d+\}/.test(phrase)) patterns.push({...rule,...compileTemplate(phrase),length:phrase.length});
        else if (!exact.has(phrase)) exact.set(phrase,rule);
      }
    }
    patterns.sort((a,b)=>b.length-a.length);
    sourceCache.set(catalog,{exact,patterns});
  }
  const {exact,patterns}=sourceCache.get(catalog);
  const hit=exact.get(value);
  if(hit)return translate(catalog,locale,hit.zh,hit.en);
  for(const rule of patterns){const match=rule.regex.exec(value);if(match){const params=[];rule.indexes.forEach((index,i)=>params[index]=match[i+1]);return formatTemplate(locale==='zh-CN'?rule.zh:locale==='en'?rule.en:catalog[locale]?.[rule.en]||rule.en,params);}}
  return value;
}
export function translate(catalog, locale, chinese, english) {
  if (locale === 'zh-CN') return chinese;
  if (locale === 'en') return english;
  const pack = catalog[locale];
  if (!pack) return english;
  if (Object.hasOwn(pack,english)) return pack[english];
  if (!templateCache.has(catalog)) {
    const rules = Object.fromEntries(locales.map(lang => [lang,
      Object.entries(catalog[lang]).filter(([key]) => /\{\d+\}/.test(key))
        .map(([key,value]) => ({...compileTemplate(key),value,specificity:key.replace(/\{\d+\}/g,'').length}))
        .sort((a,b)=>b.specificity-a.specificity)
    ]));
    templateCache.set(catalog,rules);
  }
  for (const rule of templateCache.get(catalog)[locale]) { const match = rule.regex.exec(english); if (match) { const params = []; rule.indexes.forEach((index,i) => { params[index] = match[i+1]; }); return formatTemplate(rule.value,params); } }
  // The build-time audit rejects missing keys; never translate user text or use a network service.
  if (import.meta.env?.DEV) console.warn(`[i18n:${locale}] Missing system text: ${english}`);
  return english;
}
