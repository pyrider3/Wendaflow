// "@file" mentions in an agent task: suggest workspace files while typing, and attach what was mentioned when the task runs.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', '.next', 'target', '.cache', '.wonderful', '.playwright-cli']);
const VISIT_LIMIT = 8000;
const cache = new Map();

async function collect(root) {
  const hit = cache.get(root);
  if (hit && Date.now() - hit.at < 15_000) return hit.files;
  const files = [];
  const queue = [''];
  while (queue.length && files.length < VISIT_LIMIT) {
    const rel = queue.shift();
    let entries = [];
    try { entries = await readdir(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.git')) queue.push(next); }
      else if (entry.isFile()) files.push(next);
    }
  }
  cache.set(root, { at: Date.now(), files });
  return files;
}

// Best matches first: file name starts with the query, then name contains it, then the path does.
export async function listWorkspaceFiles(workspace, query = '', limit = 30) {
  const root = path.resolve(workspace);
  const needle = query.trim().toLowerCase();
  const files = await collect(root);
  const score = (file) => {
    const lower = file.toLowerCase(), name = lower.slice(lower.lastIndexOf('/') + 1);
    if (!needle) return 3;
    if (name.startsWith(needle)) return 0;
    if (name.includes(needle)) return 1;
    return lower.includes(needle) ? 2 : -1;
  };
  return files.map((file) => ({ file, rank: score(file) })).filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.file.length - b.file.length || a.file.localeCompare(b.file)).slice(0, limit).map((item) => item.file);
}

const TASK_MARKER = '当前需要执行的任务：\n';

// Appends the contents of existing, text-like files that the task mentions as @path. Unknown @words (emails, handles) are left alone.
export async function expandMentions(prompt, workspace, { maxFiles = 8, maxBytes = 200_000, totalBytes = 120_000 } = {}) {
  const root = path.resolve(workspace);
  const at = prompt.lastIndexOf(TASK_MARKER);
  const task = at >= 0 ? prompt.slice(at + TASK_MARKER.length) : prompt;
  const found = new Map();
  for (const match of task.matchAll(/(?:^|[\s(（])@([^\s@]+)/g)) {
    const rel = match[1].replace(/[.,;:!?)\]}，。；：！？）]+$/, '');
    if (!rel || found.has(rel) || found.size >= maxFiles) continue;
    const full = path.resolve(root, rel);
    if (full === root || !full.startsWith(root + path.sep)) continue;
    try {
      const info = await stat(full);
      if (!info.isFile() || info.size > maxBytes) continue;
      const data = await readFile(full);
      if (data.subarray(0, 8000).includes(0)) continue;
      found.set(rel, data.toString('utf8'));
    } catch { /* not a file */ }
  }
  if (!found.size) return prompt;
  let budget = totalBytes;
  const blocks = [];
  for (const [rel, text] of found) {
    const body = text.length > budget ? `${text.slice(0, Math.max(0, budget))}\n…（已截断）` : text;
    budget -= text.length;
    blocks.push(`@${rel}\n\`\`\`\n${body}\n\`\`\``);
    if (budget <= 0) break;
  }
  return `${prompt}\n\n---\n任务里用 @ 引用了以下工作目录中的文件，内容如下：\n\n${blocks.join('\n\n')}`;
}
