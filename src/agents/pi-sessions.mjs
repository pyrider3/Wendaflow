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
