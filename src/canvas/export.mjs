// Turns a canvas into things other people can open: Markdown outline, SVG, standalone HTML.
// Pure functions, no DOM, so they are testable and PNG rendering can reuse the SVG.
import { parentIdsOf } from './parents.mjs';
import { tidyLayout } from './tidy-layout.mjs';

const CARD_W = 300;
const PAD = 16;
const MARGIN = 56;
const TITLE_LINE = 23;
const BODY_LINE = 20;
const TITLE_LINES = 3;
const BODY_LINES = 8;
const IMAGE_H = 170;

const PALETTES = {
  light: { bg: '#f6f8f6', dot: '#d3dcd6', card: '#ffffff', border: '#c9d4cd', title: '#1d2823', body: '#51605a', muted: '#7a8780', line: '#9db0a6', accent: '#2c7a5b', ref: '#c07a3a' },
  dark: { bg: '#0e1016', dot: '#2a3040', card: '#1a1e2a', border: '#343c52', title: '#eef1f8', body: '#aab4c8', muted: '#8590a8', line: '#6c7ca6', accent: '#8fa8ff', ref: '#e0a060' },
};

export function escapeXml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const plain = (text) => String(text ?? '').replace(/```[\s\S]*?```/g, ' [code] ').replace(/^\s*>+\s?/gm, '').replace(/[#*_`~|]/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
const isWide = (ch) => /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(ch);
const charWidth = (ch, size) => (isWide(ch) ? size : size * 0.56);

export function wrapText(text, maxWidth, size, maxLines) {
  const lines = [];
  let line = '';
  let width = 0;
  for (const ch of plain(text)) {
    const w = charWidth(ch, size);
    if (width + w > maxWidth && line) { lines.push(line.trimEnd()); line = ''; width = 0; if (ch === ' ') continue; }
    line += ch; width += w;
  }
  if (line.trim()) lines.push(line.trimEnd());
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.$/, '')}…`; }
  return lines;
}

export function nodeLabel(node) {
  return plain(node.title) || plain(node.prompt) || plain(node.content).slice(0, 40) || (node.type === 'thought' ? 'Idea' : 'Untitled');
}

// Pixel size of a PNG, JPEG or WebP data URL, read from its header, so images keep their shape.
export function imageSize(dataUrl) {
  try {
    const comma = dataUrl.indexOf(',');
    const head = globalThis.atob(dataUrl.slice(comma + 1, comma + 1 + 87_384));
    const at = (i) => head.charCodeAt(i);
    const be16 = (i) => (at(i) << 8) | at(i + 1), le16 = (i) => at(i) | (at(i + 1) << 8), le24 = (i) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16);
    if (head.startsWith('\x89PNG')) return { width: (be16(16) << 16) | be16(18), height: (be16(20) << 16) | be16(22) };
    if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') {
      const kind = head.slice(12, 16);
      if (kind === 'VP8X') return { width: le24(24) + 1, height: le24(27) + 1 };
      if (kind === 'VP8 ') return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
      if (kind === 'VP8L') { const b = [at(21), at(22), at(23), at(24)]; return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) }; }
    }
    if (at(0) === 0xff && at(1) === 0xd8) {
      for (let i = 2; i < head.length - 9;) {
        if (at(i) !== 0xff) { i += 1; continue; }
        const marker = at(i + 1), length = be16(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: be16(i + 7), height: be16(i + 5) };
        i += 2 + length;
      }
    }
  } catch {}
  return null;
}

// Images a card carries (data URLs only, so the export stays self-contained).
const cardImages = (node) => (Array.isArray(node.attachments) ? node.attachments : []).filter((item) => item && typeof item.dataUrl === 'string' && /^data:image\//.test(item.dataUrl)).slice(0, 2);

function layoutCard(node) {
  const images = cardImages(node);
  const hasText = !!(plain(node.title) || plain(node.prompt) || plain(node.content));
  // An image-only idea is just its image: no made-up "Idea" heading.
  const label = images.length && !hasText ? '' : nodeLabel(node);
  const title = label ? wrapText(label, CARD_W - PAD * 2, 15, TITLE_LINES) : [];
  const text = plain(node.title) ? (node.prompt && node.type !== 'thought' ? `${plain(node.prompt)} — ${plain(node.content)}` : node.content) : node.content;
  const body = node.type === 'thought' && !plain(node.title) ? [] : wrapText(text === label ? '' : text, CARD_W - PAD * 2, 13, BODY_LINES);
  const imagesTop = PAD + title.length * TITLE_LINE + (body.length ? 6 + body.length * BODY_LINE : 0) + (title.length || body.length ? 8 : 0);
  // Each image at its own aspect ratio across the card's width (capped, so a tall screenshot stays compact).
  const placed = images.map((image) => { const size = imageSize(image.dataUrl); const h = size && size.width ? Math.round(Math.min(360, Math.max(60, (CARD_W - PAD * 2) * size.height / size.width))) : IMAGE_H; return { ...image, h }; });
  const height = imagesTop + placed.reduce((sum, image) => sum + image.h + 8, 0) + PAD - 2;
  return { node, title, body, images: placed, imagesTop, w: CARD_W, h: Math.max(52, height), x: Number(node.x) || 0, y: Number(node.y) || 0 };
}

function anchorPoint(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) / a.w >= Math.abs(dy) / a.h) return dx >= 0 ? { x: a.x + a.w, y: a.y + a.h / 2, d: 'r' } : { x: a.x, y: a.y + a.h / 2, d: 'l' };
  return dy >= 0 ? { x: a.x + a.w / 2, y: a.y + a.h, d: 'b' } : { x: a.x + a.w / 2, y: a.y, d: 't' };
}

function curve(p, q) {
  const k = Math.max(40, Math.hypot(q.x - p.x, q.y - p.y) * 0.4);
  const off = { r: [k, 0], l: [-k, 0], b: [0, k], t: [0, -k] };
  const [ax, ay] = off[p.d];
  const [bx, by] = off[q.d];
  return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}C${(p.x + ax).toFixed(1)} ${(p.y + ay).toFixed(1)} ${(q.x + bx).toFixed(1)} ${(q.y + by).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
}

// tidy: lay the cards out as a clean tree (the default for exports, which are meant to be read) instead of
// keeping where they happen to sit on the canvas.
export function toSVG(nodes, { theme = 'light', title = '', tidy = true } = {}) {
  const p = PALETTES[theme] || PALETTES.light;
  const cards = nodes.map(layoutCard);
  if (tidy && cards.length) {
    const size = new Map(cards.map((c) => [c.node.id, { width: c.w, height: c.h }]));
    const ids = new Set(cards.map((c) => c.node.id));
    const rootOf = (node) => { let cursor = node; const seen = new Set(); while (cursor.parentId && ids.has(cursor.parentId) && !seen.has(cursor.id)) { seen.add(cursor.id); cursor = cards.find((c) => c.node.id === cursor.parentId).node; } return cursor.id; };
    const trees = new Map();
    for (const c of cards) { const root = rootOf(c.node); if (!trees.has(root)) trees.set(root, []); trees.get(root).push(c); }
    const boxes = [...trees.values()].map((group) => {
      const at = tidyLayout(group.map((c) => c.node), (node) => size.get(node.id), { left: 0, top: 0, columnGap: 90, rowGap: 22, treeGap: 60 });
      for (const c of group) { const spot = at.get(c.node.id); c.x = spot.x; c.y = spot.y; }
      return { group, w: Math.max(...group.map((c) => c.x + c.w)), h: Math.max(...group.map((c) => c.y + c.h)), top: Math.min(...group.map((c) => Number(c.node.y) || 0)) };
    }).sort((a, b) => a.top - b.top);
    const area = boxes.reduce((sum, box) => sum + (box.w + 60) * (box.h + 60), 0);
    const targetHeight = Math.max(...boxes.map((box) => box.h), Math.sqrt(area * 0.75));
    let colX = 0, colY = 0, colW = 0;
    for (const box of boxes) {
      if (colY > 0 && colY + box.h > targetHeight) { colX += colW + 80; colY = 0; colW = 0; }
      for (const c of box.group) { c.x += colX; c.y += colY; }
      colY += box.h + 60; colW = Math.max(colW, box.w);
    }
  }
  const byId = new Map(cards.map((c) => [c.node.id, c]));
  if (!cards.length) cards.push({ node: {}, title: ['Empty canvas'], body: [], w: CARD_W, h: 60, x: 0, y: 0 });
  const minX = Math.min(...cards.map((c) => c.x)) - MARGIN;
  const minY = Math.min(...cards.map((c) => c.y)) - MARGIN - (title ? 36 : 0);
  const maxX = Math.max(...cards.map((c) => c.x + c.w)) + MARGIN;
  const maxY = Math.max(...cards.map((c) => c.y + c.h)) + MARGIN;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const edges = [];
  for (const card of cards) {
    const parents = parentIdsOf(card.node);
    parents.forEach((pid, index) => {
      const from = byId.get(pid);
      if (from) edges.push({ d: curve(anchorPoint(from, card), anchorPoint(card, from)), dash: index > 0 });
    });
    for (const rel of card.node.relations || []) {
      const to = byId.get(rel.targetId);
      if (to) edges.push({ d: curve(anchorPoint(card, to), anchorPoint(to, card)), ref: true });
    }
  }
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" font-family="system-ui,-apple-system,'Segoe UI','Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif">`);
  out.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${p.bg}"/>`);
  if (title) out.push(`<text x="${minX + MARGIN}" y="${minY + 40}" font-size="20" font-weight="700" fill="${p.title}">${escapeXml(title)}</text>`);
  for (const e of edges) {
    out.push(`<path d="${e.d}" fill="none" stroke="${e.ref ? p.ref : p.line}" stroke-width="1.8" stroke-linecap="round"${e.dash || e.ref ? ' stroke-dasharray="6 5"' : ''}/>`);
  }
  for (const c of cards) {
    out.push(`<g><rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="12" fill="${p.card}" stroke="${p.border}" stroke-width="1.2"/>`);
    c.title.forEach((line, i) => out.push(`<text x="${c.x + PAD}" y="${c.y + PAD + 15 + i * TITLE_LINE}" font-size="15" font-weight="650" fill="${p.title}">${escapeXml(line)}</text>`));
    const bodyTop = c.y + PAD + c.title.length * TITLE_LINE + 6;
    c.body.forEach((line, i) => out.push(`<text x="${c.x + PAD}" y="${bodyTop + 13 + i * BODY_LINE}" font-size="13" fill="${p.body}">${escapeXml(line)}</text>`));
    let imageY = c.y + c.imagesTop;
    for (const image of c.images || []) { out.push(`<image href="${escapeXml(image.dataUrl)}" x="${c.x + PAD}" y="${imageY}" width="${c.w - PAD * 2}" height="${image.h}" preserveAspectRatio="xMidYMid meet"/>`); imageY += image.h + 8; }
    out.push('</g>');
  }
  out.push('</svg>');
  return { svg: out.join('\n'), width, height };
}

export function toMarkdown(nodes, { title = '' } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map();
  const roots = [];
  for (const n of nodes) {
    const parent = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    if (parent) children.set(parent, [...(children.get(parent) || []), n]); else roots.push(n);
  }
  const order = (a, b) => (Number(a.y) || 0) - (Number(b.y) || 0) || (Number(a.x) || 0) - (Number(b.x) || 0);
  roots.sort(order);
  for (const list of children.values()) list.sort(order);
  const lines = title ? [`# ${title}`, ''] : [];
  const seen = new Set();
  const visit = (node, depth) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const level = Math.min(6, depth + (title ? 2 : 1));
    lines.push(`${'#'.repeat(level)} ${nodeLabel(node)}`, '');
    const question = String(node.prompt || '').trim();
    if (question && node.type !== 'thought' && question !== nodeLabel(node)) lines.push(...question.split('\n').map((l) => `> ${l}`), '');
    const body = String(node.content || '').trim();
    if (body && body !== nodeLabel(node)) lines.push(body, '');
    const extras = parentIdsOf(node).slice(1).map((id) => byId.get(id)).filter(Boolean);
    if (extras.length) lines.push(`*Also follows: ${extras.map(nodeLabel).join(', ')}*`, '');
    const refs = (node.relations || []).map((r) => byId.get(r.targetId)).filter(Boolean);
    if (refs.length) lines.push(`*See also: ${refs.map(nodeLabel).join(', ')}*`, '');
    for (const child of children.get(node.id) || []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  for (const n of nodes) visit(n, 0); // parent cycles or orphans never get dropped
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

export function toHTML(nodes, { theme = 'light', title = 'Wendaflow' } = {}) {
  const { svg } = toSVG(nodes, { theme });
  const p = PALETTES[theme] || PALETTES.light;
  const outline = escapeXml(toMarkdown(nodes));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(title)}</title>
<style>
html,body{margin:0;background:${p.bg};color:${p.title};font:15px/1.6 system-ui,-apple-system,'Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif}
header{padding:18px 24px;font-weight:700;font-size:18px}
main{overflow:auto;padding:0 24px 24px}
main svg{max-width:none;height:auto;border-radius:14px;box-shadow:0 8px 30px #0003}
details{margin:0 24px 32px;color:${p.body}}
summary{cursor:pointer;font-weight:600;color:${p.accent}}
pre{white-space:pre-wrap;word-break:break-word;background:${p.card};border:1px solid ${p.border};border-radius:12px;padding:16px}
footer{padding:0 24px 24px;color:${p.muted};font-size:12px}
</style></head><body>
<header>${escapeXml(title)}</header>
<main>${svg}</main>
<details><summary>Text outline</summary><pre>${outline}</pre></details>
<footer>Made with Wendaflow</footer>
</body></html>
`;
}
