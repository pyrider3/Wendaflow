// Read-only view of Pi's own session files (~/.pi/agent/sessions/<cwd>/<time>_<id>.jsonl), so sessions started in
// a terminal can be listed and brought onto the canvas. Nothing here writes to Pi's files.
import { open, readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const piSessionsRoot = () => path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'sessions');

const HEAD_BYTES = 256_000, TAIL_BYTES = 96_000, CANDIDATES = 150;
const clip = (text, limit) => { const value = String(text || '').replace(/\s+/g, ' ').trim(); return value.length > limit ? `${value.slice(0, limit)}…` : value; };

// Wendaflow wraps every task in context + instructions; the user only ever typed the middle part.
export function unwrapPrompt(text) {
  const value = String(text || '');
  const marker = '当前需要执行的任务：\n';
  const at = value.lastIndexOf(marker);
  if (at < 0) return value.trim();
  const rest = value.slice(at + marker.length);
  const end = rest.indexOf('\n\n请在最终答复中说明');
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

const blocksText = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((block) => block?.type === 'text').map((block) => block.text || '').join('\n') : '');

async function slice(file, start, length) {
  const handle = await open(file, 'r');
  try { const buffer = Buffer.alloc(length); const { bytesRead } = await handle.read(buffer, 0, length, start); return buffer.subarray(0, bytesRead).toString('utf8'); } finally { await handle.close(); }
}

const parseLines = (text, dropEdges) => {
  const lines = text.split('\n');
  if (dropEdges === 'head') lines.pop(); else if (dropEdges === 'tail') lines.shift();
  const records = [];
  for (const line of lines) { try { records.push(JSON.parse(line)); } catch { /* partial line */ } }
  return records;
};

async function summarize(file, info) {
  const small = info.size <= HEAD_BYTES;
  const head = parseLines(await slice(file, 0, HEAD_BYTES), small ? null : 'head');
  const header = head.find((record) => record.type === 'session');
  if (!header) return null;
  const firstUser = head.find((record) => record.type === 'message' && record.message?.role === 'user');
  const tail = small ? head : parseLines(await slice(file, Math.max(0, info.size - TAIL_BYTES), TAIL_BYTES), 'tail');
  const lastAssistant = [...tail].reverse().find((record) => record.type === 'message' && record.message?.role === 'assistant' && blocksText(record.message.content).trim());
  return {
    id: header.id, file, cwd: header.cwd || '', startedAt: header.timestamp, updatedAt: new Date(info.mtimeMs).toISOString(), size: info.size,
    forked: !!header.parentSession,
    title: clip(unwrapPrompt(blocksText(firstUser?.message?.content)), 140) || '(no prompt)',
    preview: clip(blocksText(lastAssistant?.message?.content), 220),
  };
}

export async function listPiSessions({ root = piSessionsRoot(), cwd = '', query = '', limit = 60 } = {}) {
  const files = [];
  let folders = [];
  try { folders = await readdir(root, { withFileTypes: true }); } catch { return []; }
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    let names = []; try { names = await readdir(path.join(root, folder.name)); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(root, folder.name, name);
      try { files.push({ file, info: await stat(file) }); } catch { /* vanished */ }
    }
  }
  files.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
  const needle = query.trim().toLowerCase(), out = [];
  for (const { file, info } of files.slice(0, CANDIDATES)) {
    let item = null; try { item = await summarize(file, info); } catch { /* unreadable */ }
    if (!item) continue;
    if (cwd && path.resolve(item.cwd) !== path.resolve(cwd)) continue;
    if (needle && !`${item.title} ${item.preview} ${item.cwd}`.toLowerCase().includes(needle)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const toolSummary = (block) => {
  const args = block.arguments || block.input || {};
  const direct = args.command || args.path || args.file_path || args.pattern || '';
  return `${block.name || 'tool'}${direct ? `\n${clip(direct, 400)}` : ''}`;
};

// The conversation as card events: what was asked, what Pi said, which tools it called.
export async function readPiSession(id, { root = piSessionsRoot(), maxEvents = 120 } = {}) {
  if (!/^[0-9a-fA-F-]{8,}$/.test(String(id))) throw new Error('无效的会话 ID');
  const summary = (await listPiSessions({ root, limit: 400 })).find((item) => item.id === id);
  if (!summary) throw new Error('找不到这个 Pi 会话');
  if ((await stat(summary.file)).size > 40_000_000) throw new Error('这个会话文件太大，暂不支持导入');
  const events = [];
  let output = '';
  for (const line of (await readFile(summary.file, 'utf8')).split('\n')) {
    let record; try { record = JSON.parse(line); } catch { continue; }
    if (record.type !== 'message' || !record.message) continue;
    const { role, content } = record.message;
    if (role === 'user') { const text = unwrapPrompt(blocksText(content)); if (text) events.push({ type: 'user', text: text.slice(0, 4000) }); }
    else if (role === 'assistant') {
      for (const block of typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []) {
        if (block?.type === 'text' && block.text?.trim()) { events.push({ type: 'message', text: block.text.trim().slice(0, 6000) }); output = block.text.trim(); }
        else if (block?.type === 'toolCall') events.push({ type: 'command', text: toolSummary(block) });
      }
    }
  }
  const shown = events.slice(-maxEvents).map((event, index) => ({ id: index + 1, at: summary.updatedAt, ...event }));
  return { session: summary, events: shown, output, prompt: events.find((event) => event.type === 'user')?.text || summary.title };
};

// Spending and tokens across every Pi session (Wendaflow's and the terminal's) in the last `days` days,
// per day and per model, read from the usage Pi records on each assistant message.
export async function piUsage({ root = piSessionsRoot(), days = 30, now = Date.now() } = {}) {
  const since = now - days * 86_400_000;
  const byDay = new Map(), byModel = new Map();
  const totals = { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, sessions: 0 };
  let folders = [];
  try { folders = await readdir(root, { withFileTypes: true }); } catch { folders = []; }
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    let files = [];
    try { files = await readdir(path.join(root, folder.name)); } catch { continue; }
    for (const name of files.filter((file) => file.endsWith('.jsonl'))) {
      const file = path.join(root, folder.name, name);
      let info; try { info = await stat(file); } catch { continue; }
      if (info.mtimeMs < since || info.size > 200_000_000) continue;
      let text; try { text = await readFile(file, 'utf8'); } catch { continue; }
      let counted = false;
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue;
        let record; try { record = JSON.parse(line); } catch { continue; }
        const message = record?.message;
        if (message?.role !== 'assistant' || !message.usage) continue;
        const at = Date.parse(record.timestamp || '') || Number(message.timestamp) || info.mtimeMs;
        if (at < since) continue;
        const usage = message.usage, cost = Number(usage.cost?.total) || 0;
        const day = new Date(at).toISOString().slice(0, 10), model = `${message.provider || '?'}/${message.model || '?'}`;
        const tokens = (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
        const d = byDay.get(day) || { date: day, cost: 0, tokens: 0, turns: 0 };
        d.cost += cost; d.tokens += tokens; d.turns += 1; byDay.set(day, d);
        const m = byModel.get(model) || { model, cost: 0, tokens: 0, turns: 0 };
        m.cost += cost; m.tokens += tokens; m.turns += 1; byModel.set(model, m);
        totals.cost += cost; totals.input += usage.input || 0; totals.output += usage.output || 0; totals.cacheRead += usage.cacheRead || 0; totals.cacheWrite += usage.cacheWrite || 0; totals.turns += 1;
        counted = true;
      }
      if (counted) totals.sessions += 1;
    }
  }
  const daysList = [];
  for (let at = since; at <= now; at += 86_400_000) { const day = new Date(at).toISOString().slice(0, 10); daysList.push(byDay.get(day) || { date: day, cost: 0, tokens: 0, turns: 0 }); }
  return { days: [...new Map(daysList.map((item) => [item.date, item])).values()], models: [...byModel.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens), totals };
}

// The file of a saved Pi session by its id, wherever it is stored. Pi files sessions under the folder they
// ran in, so a session started in an isolated copy is only found by id from that same folder; passing the
// file path to --fork / --session works from anywhere.
export async function findPiSessionFile(id, root = piSessionsRoot()) {
  const wanted = String(id || '');
  if (!/^[\w-]{6,80}$/.test(wanted)) return '';
  let folders = [];
  try { folders = await readdir(root, { withFileTypes: true }); } catch { return ''; }
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    let files = [];
    try { files = await readdir(path.join(root, folder.name)); } catch { continue; }
    const hit = files.find((name) => name.endsWith(`_${wanted}.jsonl`));
    if (hit) return path.join(root, folder.name, hit);
  }
  return '';
}

// Every model Pi has in its cached provider catalogs (models-store.json), for filling in what Wendaflow's
// own model connections do not say (context window, limits, price).
export async function piModelCatalog(agentDir = path.dirname(piSessionsRoot())) {
  try {
    const store = JSON.parse(await readFile(path.join(agentDir, 'models-store.json'), 'utf8'));
    return Object.values(store || {}).flatMap((entry) => (Array.isArray(entry?.models) ? entry.models : []));
  } catch { return []; }
}

// Pi's session tree (get_tree) boiled down for display: what the user said, the first words of each
// answer, compaction points and branch summaries, with labels. Tool calls and settings changes are
// skipped (their children move up). `active` marks the branch the session is on; `forkable` the user
// messages Pi can branch from (get_fork_messages).
export function summarizePiTree(roots, leafId = '', forkableIds = []) {
  const forkable = new Set(forkableIds), parentOf = new Map();
  const index = (node, parent) => { const id = node?.entry?.id; if (id) parentOf.set(id, parent); for (const child of node?.children || []) index(child, id); };
  for (const root of Array.isArray(roots) ? roots : []) index(root, null);
  const active = new Set();
  for (let id = leafId; id; id = parentOf.get(id)) active.add(id);
  const kindOf = (entry) => {
    if (entry?.type === 'message' && entry.message?.role === 'user') return ['user', unwrapPrompt(blocksText(entry.message.content))];
    if (entry?.type === 'message' && entry.message?.role === 'assistant') { const text = blocksText(entry.message.content).trim(); return text ? ['assistant', text] : null; }
    if (entry?.type === 'compaction') return ['compaction', entry.summary || ''];
    if (entry?.type === 'branch_summary') return ['branch', entry.summary || ''];
    return null;
  };
  let count = 0;
  const build = (node) => {
    if (count > 600) return [];
    const children = (node?.children || []).flatMap(build);
    const kind = kindOf(node?.entry);
    if (!kind) return children;
    count += 1;
    const id = node.entry.id;
    return [{ id, kind: kind[0], text: clip(kind[1], kind[0] === 'user' ? 400 : 160), label: node.label || '', active: active.has(id), forkable: forkable.has(id), tokensBefore: node.entry.tokensBefore ?? null, children }];
  };
  return (Array.isArray(roots) ? roots : []).flatMap(build);
}
