// Follows one action run. Updates arrive as server-sent events from /agent/stream the moment the run
// changes; if the stream cannot be opened or drops, it falls back to asking /agent/status every 280 ms,
// so a card never stops updating. next() resolves with the next state of the run.
export function openJobStream(baseUrl, jobId) {
  const statusUrl = `${baseUrl}/agent/status?id=${encodeURIComponent(jobId)}`;
  const queue = [];
  let waiter = null, source = null, polling = typeof EventSource === "undefined";
  const deliver = (state) => { if (waiter) { const resolve = waiter; waiter = null; resolve(state); } else queue.push(state); };
  if (!polling) {
    try {
      source = new EventSource(`${baseUrl}/agent/stream?id=${encodeURIComponent(jobId)}`);
      source.onmessage = (event) => { try { deliver(JSON.parse(event.data)); } catch {} };
      // The server ends the stream when the run settles; any error switches to polling, which also
      // fetches that final state.
      source.onerror = () => { source?.close(); source = null; polling = true; if (waiter) poll(); };
    } catch { polling = true; }
  }
  async function poll() {
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    const response = await fetch(statusUrl);
    const state = await response.json();
    if (!response.ok) throw new Error(state.error);
    return state;
  }
  return {
    async next() {
      if (queue.length) { const latest = queue[queue.length - 1]; queue.length = 0; return latest; }
      if (polling) return poll();
      return new Promise((resolve, reject) => {
        waiter = resolve;
        // A quiet stream is fine, but never wait forever: check the status every few seconds anyway.
        window.setTimeout(() => { if (waiter === resolve) { waiter = null; poll().then(resolve, reject); } }, 4000);
      });
    },
    close() { source?.close(); source = null; },
  };
}
