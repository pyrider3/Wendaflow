// The newest agent revision this browser has applied, per canvas. Saved with
// each canvas save so the server can tell which agent edits a save is missing.
export const REVISIONS_KEY = 'wendaflow-agent-revisions-v1';

export function agentRevisions(storage) {
  let map = {};
  try { const saved = JSON.parse(storage?.getItem(REVISIONS_KEY) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) map = saved; } catch {}
  const write = () => { try { storage?.setItem(REVISIONS_KEY, JSON.stringify(map)); } catch {} };
  return {
    get: (id) => Number(map[id]) || 0,
    set(id, rev) { if (!id || !Number.isFinite(rev) || rev <= (Number(map[id]) || 0)) return; map[id] = rev; write(); },
    forget(id) { if (id in map) { delete map[id]; write(); } },
  };
}
