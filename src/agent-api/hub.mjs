// The live link between agents, WDF files and open browser tabs.
//
// One writer: every change an agent makes goes through mutate(), which applies
// node operations to the WDF file under a per-canvas lock, bumps the canvas's
// agentRevision, keeps the operations in a short log and pushes them to every
// connected browser over Server-Sent Events. Browsers apply the same operations
// to their live canvas and report the revision they have seen with each save;
// a save that predates some agent change gets those operations re-applied on
// top, so neither side overwrites the other.
import { randomUUID } from 'node:crypto';
import { normalizeWdf } from '../canvas/document.mjs';
import { applyCanvasOps } from './ops.mjs';

export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; this.status = 409; }
}

const LOG_LIMIT = 400, EVENT_LIMIT = 600;

export function createAgentHub({ load, save, now = () => new Date().toISOString(), commandTimeout = 2500 } = {}) {
  const revs = new Map(), logs = new Map(), queues = new Map(), clients = new Map(), waiting = new Map();
  const events = [];
  let seq = 0;

  const serial = (id, fn) => {
    const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(id, task);
    return task.finally(() => { if (queues.get(id) === task) queues.delete(id); });
  };

  async function revisionOf(id) {
    if (revs.has(id)) return revs.get(id);
    let rev = 0;
    try { rev = Number((await load(id))?.agentRevision) || 0; } catch {}
    revs.set(id, rev);
    return rev;
  }

  function send(client, event) {
    try { client.res.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`); } catch {}
  }
  function broadcast(type, data, filter = () => true) {
    const event = { seq: ++seq, type, data };
    // Only durable changes are replayed to a reconnecting tab; commands and live previews are not.
    if ((type === 'ops' && !data.transient) || type === 'canvas') { events.push(event); if (events.length > EVENT_LIMIT) events.shift(); }
    for (const client of clients.values()) if (filter(client)) send(client, event);
    return event;
  }

  // Browsers showing `canvasId` right now, most recently active first.
  function viewers(canvasId) {
    return [...clients.values()].filter(c => !canvasId || c.activeCanvasId === canvasId).sort((a, b) => b.seenAt - a.seenAt);
  }

  // Ask connected browsers to do something (save now, open a canvas, arrange…)
  // and wait for the first answer. Resolves null when nobody answers in time.
  function command(type, data = {}, { canvasId = null, timeout = commandTimeout } = {}) {
    const targets = viewers(canvasId);
    if (!targets.length) return Promise.resolve(null);
    const id = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, timeout);
      waiting.set(id, { resolve: (value) => { clearTimeout(timer); waiting.delete(id); resolve(value); } });
      const ids = new Set(targets.map(c => c.id));
      broadcast('command', { id, type, canvasId, ...data }, c => ids.has(c.id));
    });
  }
  function acknowledge(id, result = {}) {
    const entry = waiting.get(id);
    if (entry) entry.resolve({ ok: true, ...result });
    return !!entry;
  }

  // Pull the browser's unsaved edits into the file before an agent reads or writes.
  async function flush(canvasId) {
    if (!viewers(canvasId).length) return false;
    const answer = await command('flush', {}, { canvasId });
    return !!answer?.ok;
  }

  async function read(id) {
    await flush(id);
    await queues.get(id)?.catch(() => {});
    const payload = await load(id);
    if (!payload) throw Object.assign(new Error(`画布不存在：${id}`), { status: 404 });
    return payload;
  }

  // fn(payload) → {ops, result}. Ops are validated by normalizeWdf before saving.
  async function mutate(id, fn, { flushFirst = true } = {}) {
    if (flushFirst) await flush(id);
    return serial(id, async () => {
      const payload = await load(id);
      if (!payload) throw Object.assign(new Error(`画布不存在：${id}`), { status: 404 });
      const outcome = (await fn(payload)) || {};
      const ops = outcome.ops || [];
      if (!ops.length) return { ...outcome, revision: await revisionOf(id) };
      const stamp = now();
      const next = applyCanvasOps(payload, ops);
      normalizeWdf({ ...next, format: next.format || 'branchspace-wdf' });
      const rev = Math.max(await revisionOf(id), Number(payload.agentRevision) || 0) + 1;
      await save({ ...next, canvas: { ...next.canvas, updatedAt: stamp }, agentRevision: rev });
      revs.set(id, rev);
      const log = logs.get(id) || [];
      log.push({ rev, ops, at: stamp });
      if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
      logs.set(id, log);
      broadcast('ops', { canvasId: id, rev, ops, name: next.canvas?.name });
      return { ...outcome, revision: rev };
    });
  }

  // Display-only updates (a streaming answer): shown live, never logged or saved.
  function preview(id, ops) { broadcast('ops', { canvasId: id, ops, transient: true }); }

  async function create(payload) {
    const id = payload.canvas.id;
    return serial(id, async () => {
      const rev = 1;
      await save({ ...payload, agentRevision: rev });
      revs.set(id, rev);
      broadcast('canvas', { canvasId: id, rev, canvas: payload.canvas });
      return { id, revision: rev };
    });
  }

  // A browser's own save. `agentRev` is the newest agent revision that tab has applied.
  async function browserSave(payload) {
    const id = payload?.canvas?.id;
    const { agentRev, ...rest } = payload || {};
    if (typeof agentRev !== 'number') {
      // A tab without the live link: keep the file's revision but merge nothing.
      const rev = await revisionOf(id);
      return serial(id, async () => { await save(rev ? { ...rest, agentRevision: rev } : rest); return { revision: rev }; });
    }
    return serial(id, async () => {
      const rev = await revisionOf(id);
      let merged = rest;
      if (agentRev < rev) {
        const missing = (logs.get(id) || []).filter(entry => entry.rev > agentRev);
        if (!missing.length || missing[0].rev !== agentRev + 1) throw new ConflictError('画布已被外部 Agent 修改，请重新载入后再保存。');
        merged = applyCanvasOps(rest, missing.flatMap(entry => entry.ops));
      }
      const finalRev = Math.max(rev, agentRev);
      await save(finalRev ? { ...merged, agentRevision: finalRev } : merged);
      if (finalRev !== rev) revs.set(id, finalRev);
      return { revision: finalRev, merged: merged !== rest };
    });
  }

  function opsSince(id, since) {
    const log = logs.get(id) || [];
    const missing = log.filter(entry => entry.rev > since);
    const complete = !missing.length ? (revs.get(id) || 0) <= since : missing[0].rev === since + 1;
    return { complete, entries: missing, revision: revs.get(id) || 0 };
  }

  // --- browser connections ----------------------------------------------------
  function attach(req, res, { clientId = randomUUID(), lastEventId = null, headers = {} } = {}) {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const previous = clients.get(clientId);
    const client = { id: clientId, res, activeCanvasId: previous?.activeCanvasId || null, profiles: previous?.profiles || [], defaultModel: previous?.defaultModel || null, seenAt: Date.now() };
    clients.set(clientId, client);
    const last = Number(lastEventId);
    if (Number.isFinite(last) && last > 0) for (const event of events) if (event.seq > last) send(client, event);
    send(client, { seq, type: 'hello', data: { clientId, revisions: Object.fromEntries(revs) } });
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25_000);
    ping.unref?.();
    const close = () => { clearInterval(ping); if (clients.get(clientId) === client) clients.delete(clientId); };
    req.on('close', close); res.on('error', close);
    return client;
  }

  function presence(clientId, { activeCanvasId, activeCanvasName, profiles, defaultModel } = {}) {
    const client = clients.get(clientId);
    if (!client) return false;
    if (activeCanvasId !== undefined) client.activeCanvasId = activeCanvasId || null;
    if (activeCanvasName !== undefined) client.activeCanvasName = String(activeCanvasName || '');
    if (Array.isArray(profiles)) client.profiles = profiles;
    if (defaultModel !== undefined) client.defaultModel = defaultModel || null;
    client.seenAt = Date.now();
    return true;
  }

  function status() {
    const list = viewers();
    return { browsers: list.length, activeCanvasId: list[0]?.activeCanvasId || null, activeCanvasName: list[0]?.activeCanvasName || '' };
  }
  // Model connections shared by the most recently active tab (kept in memory only).
  function browserModels() {
    const client = viewers().find(c => c.profiles?.length);
    return { profiles: client?.profiles || [], defaultModel: client?.defaultModel || null };
  }

  function close() { for (const client of clients.values()) { try { client.res.end(); } catch {} } clients.clear(); }

  return { read, mutate, preview, create, browserSave, flush, command, acknowledge, attach, presence, status, browserModels, opsSince, revisionOf, broadcast, close, serial };
}
