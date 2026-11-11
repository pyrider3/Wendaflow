// Workspace snapshots for agent runs: copy the (small, text-ish) tree before a run, diff it after, roll files back on request.
// Everything here is bounded: huge trees are skipped rather than slowing a run down.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, constants as fsConstants, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SNAPSHOT_LIMITS = { files: 4000, fileBytes: 1_000_000, totalBytes: 80_000_000, listedFiles: 300 };
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', '.next', 'target', '.cache', '.wonderful', '.playwright-cli']);

// Pi's workflow extension drops this folder into whatever directory it runs in; it is never the user's work.
const IGNORED_PREFIXES = ['skills/system/run-workflow/'];
const hashOf = (data) => createHash('sha1').update(data).digest('hex');
const isBinary = (data) => data.subarray(0, 8000).includes(0);

// Relative file paths (posix separators) with size + mtime; null when the tree is over the limits.
async function walk(root, limits = SNAPSHOT_LIMITS) {
  const files = new Map();
  let total = 0;
  const visit = async (directory) => {
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return true; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (SKIP_DIRS.has(entry.name)) continue; if (!(await visit(full))) return false; continue; }
      if (!entry.isFile()) continue;
      let info; try { info = await stat(full); } catch { continue; }
      total += info.size;
      if (files.size >= limits.files || total > limits.totalBytes) return false;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
      files.set(rel, { size: info.size, mtimeMs: info.mtimeMs });
    }
    return true;
  };
  return (await visit(root)) ? files : null;
}

export async function takeSnapshot(workspace, dir, limits = SNAPSHOT_LIMITS) {
  const root = path.resolve(workspace);
  const files = await walk(root, limits);
  if (!files) return { ok: false, reason: 'too-large' };
  await mkdir(path.join(dir, 'base'), { recursive: true });
  const base = new Map();
  for (const [rel, info] of files) {
    if (info.size > limits.fileBytes) { base.set(rel, { ...info, large: true }); continue; }
    const target = path.join(dir, 'base', rel);
    try {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, rel), target, fsConstants.COPYFILE_FICLONE);
      base.set(rel, { ...info, hash: hashOf(await readFile(target)) });
    } catch { /* unreadable file: left out of the snapshot */ }
  }
  return { ok: true, root, dir, base };
}

const unifiedDiff = (before, after, label) => new Promise((resolve) => {
  const child = spawn('diff', ['-u', '--label', `a/${label}`, '--label', `b/${label}`, before, after], { shell: false });
  let out = ''; child.stdout.on('data', (chunk) => { if (out.length < 400_000) out += chunk; });
  child.on('error', () => resolve(null)); child.on('close', () => resolve(out));
});

const countLines = (diffText) => { let additions = 0, deletions = 0; for (const line of diffText.split('\n')) { if (line.startsWith('+') && !line.startsWith('+++')) additions += 1; else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1; } return { additions, deletions }; };

// What changed since the snapshot. Each entry: { path, status: added|modified|deleted, additions, deletions, binary, large, afterHash }.
export async function diffSnapshot(snapshot, limits = SNAPSHOT_LIMITS) {
  const now = await walk(snapshot.root, { ...limits, files: limits.files * 2, totalBytes: limits.totalBytes * 2 });
  if (!now) return { files: [], truncated: true };
  const changes = [];
  const paths = new Set([...snapshot.base.keys(), ...now.keys()]);
  for (const rel of [...paths].sort()) {
    const before = snapshot.base.get(rel), after = now.get(rel);
    const full = path.join(snapshot.root, rel);
    if (before && !after) { changes.push({ path: rel, status: 'deleted', ...(before.large ? { large: true } : {}) }); continue; }
    if (!before) { changes.push(await describe(rel, full, 'added', null, after)); continue; }
    if (before.large || after.size > limits.fileBytes) { if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) changes.push({ path: rel, status: 'modified', large: true }); continue; }
    if (before.size === after.size && before.mtimeMs === after.mtimeMs) continue;
    let data; try { data = await readFile(full); } catch { continue; }
    if (hashOf(data) === before.hash) continue;
    changes.push(await describe(rel, full, 'modified', path.join(snapshot.dir, 'base', rel), after, data));
  }
  return { files: changes.slice(0, limits.listedFiles), truncated: changes.length > limits.listedFiles };
}

async function describe(rel, full, status, basePath, info, knownData) {
  const entry = { path: rel, status };
  if (info.size > SNAPSHOT_LIMITS.fileBytes) return { ...entry, large: true };
  let data; try { data = knownData || await readFile(full); } catch { return entry; }
  entry.afterHash = hashOf(data);
  if (isBinary(data)) return { ...entry, binary: true };
  if (status === 'added') return { ...entry, additions: data.toString('utf8').split('\n').length - (data.length && data[data.length - 1] === 10 ? 1 : 0), deletions: 0 };
  const text = await unifiedDiff(basePath, full, rel);
  return text === null ? entry : { ...entry, ...countLines(text) };
}

// Unified diff of one changed file (added and deleted files diff against an empty side).
export async function fileDiff(snapshot, rel) {
  const full = resolveInside(snapshot.root, rel), basePath = path.join(snapshot.dir, 'base', rel);
  const empty = path.join(snapshot.dir, 'empty');
  await writeFile(empty, '');
  const hasBase = snapshot.base.has(rel) && !snapshot.base.get(rel).large;
  let exists = true; try { await stat(full); } catch { exists = false; }
  if (exists) { const data = await readFile(full); if (isBinary(data)) return { binary: true, diff: '' }; if (data.length > SNAPSHOT_LIMITS.fileBytes) return { large: true, diff: '' }; }
  const text = await unifiedDiff(hasBase ? basePath : empty, exists ? full : empty, rel);
  return { diff: text || '' };
}

export function resolveInside(root, rel) {
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('路径超出工作目录');
  return full;
}

// Put files back to their snapshot state. A file changed again after the run is skipped unless `force`.
export async function rollbackFiles(snapshot, changes, only, { force = false } = {}) {
  const restored = [], skipped = [];
  for (const change of changes) {
    if (only && !only.includes(change.path)) continue;
    if (change.large) { skipped.push({ path: change.path, reason: 'large' }); continue; }
    const full = resolveInside(snapshot.root, change.path);
    try {
      if (!force && change.status !== 'deleted') {
        let current = null; try { current = hashOf(await readFile(full)); } catch {}
        if (current !== (change.afterHash || null)) { skipped.push({ path: change.path, reason: 'changed-since' }); continue; }
      }
      if (change.status === 'added') { await unlink(full).catch(() => {}); }
      else { await mkdir(path.dirname(full), { recursive: true }); await copyFile(path.join(snapshot.dir, 'base', change.path), full); }
      restored.push(change.path);
    } catch (error) { skipped.push({ path: change.path, reason: error.message }); }
  }
  return { restored, skipped };
}

export const removeSnapshot = (dir) => rm(dir, { recursive: true, force: true });

// ---- Isolated runs: the agent works in a copy, the real folder only changes when a result is applied. ----
export async function copyWorkspace(source, dest, limits = SNAPSHOT_LIMITS) {
  const root = path.resolve(source);
  const files = await walk(root, { ...limits, totalBytes: limits.totalBytes * 2 });
  if (!files) return { ok: false, reason: 'too-large' };
  await mkdir(dest, { recursive: true });
  for (const rel of files.keys()) {
    const target = path.join(dest, rel);
    try { await mkdir(path.dirname(target), { recursive: true }); await copyFile(path.join(root, rel), target, fsConstants.COPYFILE_FICLONE); } catch { /* unreadable file: the copy goes without it */ }
  }
  return { ok: true, root: dest };
}

// Bring a finished isolated run into the real folder. Files the user touched meanwhile are left alone unless `force`.
export async function applyChanges(snapshot, realRoot, changes, only, { force = false } = {}) {
  const real = path.resolve(realRoot), applied = [], skipped = [];
  for (const change of changes) {
    if (only && !only.includes(change.path)) continue;
    if (change.large) { skipped.push({ path: change.path, reason: 'large' }); continue; }
    try {
      const target = resolveInside(real, change.path), from = resolveInside(snapshot.root, change.path);
      const base = snapshot.base.get(change.path);
      if (!force) {
        let current = null; try { current = hashOf(await readFile(target)); } catch {}
        const expected = change.status === 'added' ? null : (base?.hash ?? null);
        if (current !== expected && !(change.status === 'added' && current === change.afterHash)) { skipped.push({ path: change.path, reason: 'changed-since' }); continue; }
      }
      if (change.status === 'deleted') await unlink(target).catch(() => {});
      else { await mkdir(path.dirname(target), { recursive: true }); await copyFile(from, target); }
      applied.push(change.path);
    } catch (error) { skipped.push({ path: change.path, reason: error.message }); }
  }
  return { applied, skipped };
}
