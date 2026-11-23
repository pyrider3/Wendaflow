// Browser half of the agent link. It listens to the local server's event
// stream, applies agent edits to the canvas the user is looking at, answers the
// server's requests (save now, open, arrange) and tells it which canvas is open
// and which model connections the agent may use.
import { useEffect, useRef, useState } from 'react';
import { agentRevisions } from './revisions.mjs';

const CLIENT_KEY = 'wendaflow-agent-client';

function clientId() {
  try {
    const saved = sessionStorage.getItem(CLIENT_KEY);
    if (saved) return saved;
    const id = `tab-${crypto.randomUUID()}`; sessionStorage.setItem(CLIENT_KEY, id); return id;
  } catch { return `tab-${Math.random().toString(36).slice(2)}`; }
}

// handlersRef.current: { activeCanvasId(), activeCanvasName(), knownCanvasIds(), models(),
//   applyOps(canvasId, ops, {transient}), open(id), flush(id), arrange(id), reload(id) }
export function useAgentBridge({ enabled, baseUrl, handlersRef, activeCanvasId, activeCanvasName, modelsKey }) {
  const [live, setLive] = useState(false);
  const [editing, setEditing] = useState(false);
  const stateRef = useRef({ id: null, revisions: null, source: null, editingTimer: 0 });
  if (!stateRef.current.revisions) stateRef.current.revisions = agentRevisions(typeof localStorage === 'undefined' ? null : localStorage);
  const revisions = stateRef.current.revisions;

  const post = (route, body) => fetch(`${baseUrl}/agent-api/browser/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);

  async function sendPresence() {
    const h = handlersRef.current; const id = stateRef.current.id;
    if (!h || !id) return;
    const { profiles, defaultModel } = h.models();
    const answer = await post('presence', { clientId: id, activeCanvasId: h.activeCanvasId(), activeCanvasName: h.activeCanvasName(), profiles, defaultModel, knownCanvasIds: h.knownCanvasIds() });
    // Catch up on agent edits made while this tab was closed or offline.
    for (const [canvasId, rev] of Object.entries(answer?.revisions || {})) if (rev > revisions.get(canvasId)) void reconcile(canvasId);
  }

  async function reconcile(canvasId) {
    const h = handlersRef.current; if (!h) return;
    const since = revisions.get(canvasId);
    const data = await fetch(`${baseUrl}/agent-api/browser/ops?canvasId=${encodeURIComponent(canvasId)}&since=${since}`).then(r => r.json()).catch(() => null);
    if (!data) return;
    if (data.complete) { for (const entry of data.entries) if (entry.rev > revisions.get(canvasId) && h.applyOps(canvasId, entry.ops, {})) revisions.set(canvasId, entry.rev); }
    else if (await h.reload(canvasId)) revisions.set(canvasId, data.revision);
  }

  function onOps(data) {
    const h = handlersRef.current; if (!h || !data?.canvasId) return;
    if (data.transient) { if (data.canvasId === h.activeCanvasId()) h.applyOps(data.canvasId, data.ops, { transient: true }); }
    else {
      const have = revisions.get(data.canvasId);
      if (data.rev <= have) return;
      if (data.rev > have + 1) { if (h.knownCanvasIds().includes(data.canvasId)) void reconcile(data.canvasId); return; }
      if (h.applyOps(data.canvasId, data.ops, {})) revisions.set(data.canvasId, data.rev);
    }
    if (data.canvasId === h.activeCanvasId()) {
      setEditing(true); clearTimeout(stateRef.current.editingTimer);
      stateRef.current.editingTimer = setTimeout(() => setEditing(false), 2600);
    }
  }

  async function onCommand(data) {
    const h = handlersRef.current; if (!h || !data?.id) return;
    let result = {};
    try {
      if (data.type === 'flush') await h.flush(data.canvasId);
      else if (data.type === 'open') { await h.open(data.canvasId); }
      else if (data.type === 'arrange') { if (data.canvasId !== h.activeCanvasId() || !(await h.arrange(data.canvasId))) return; }
      else return;
    } catch (error) { result = { error: String(error?.message || error) }; }
    await post('ack', { id: data.id, result });
    if (data.type === 'open') void sendPresence();
  }

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return undefined;
    const id = clientId(); stateRef.current.id = id;
    const source = new EventSource(`${baseUrl}/agent-api/browser/events?client=${encodeURIComponent(id)}`);
    stateRef.current.source = source;
    const parse = (event) => { try { return JSON.parse(event.data); } catch { return null; } };
    source.addEventListener('hello', () => { setLive(true); void sendPresence(); });
    source.addEventListener('ops', (event) => onOps(parse(event)));
    source.addEventListener('command', (event) => { void onCommand(parse(event)); });
    source.onerror = () => setLive(false);
    return () => { source.close(); clearTimeout(stateRef.current.editingTimer); setLive(false); };
  }, [enabled, baseUrl]);

  useEffect(() => { if (enabled && live) void sendPresence(); }, [enabled, live, activeCanvasId, activeCanvasName, modelsKey]);

  return { live, editing, stop: (nodeId) => post('stop', { nodeId }), revisionOf: (canvasId) => revisions.get(canvasId), noteRevision: (canvasId, rev) => revisions.set(canvasId, rev), reconcile };
}
