// Follows one action run. Updates arrive as server-sent events from /agent/stream the moment the run
// changes; if the stream cannot be opened or drops, it falls back to asking /agent/status every 280 ms,
// so a card never stops updating. next() resolves with the next state of the run.
export function openJobStream(baseUrl, jobId, { EventSource: EventSourceImpl = globalThis.EventSource, fetch: fetchImpl = globalThis.fetch, pollMs = 280, quietMs = 4000 } = {}) {
  const statusUrl = `${baseUrl}/agent/status?id=${encodeURIComponent(jobId)}`;
  const queue = [];
  let waiter = null, source = null, closed = false, polling = typeof EventSourceImpl !== "function";
  const settle = (fn, value) => {
    if (!waiter) return false;
    const current = waiter; waiter = null;
    clearTimeout(current.timer);
    fn(current, value);
    return true;
  };
  const deliver = (state) => { if (!settle((current, value) => current.resolve(value), state)) queue.push(state); };
  const fail = (error) => { settle((current, value) => current.reject(value), error); };
  async function poll(delayMs = pollMs) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const response = await fetchImpl(statusUrl);
    const state = await response.json();
    if (!response.ok) throw new Error(state.error);
    return state;
  }
  if (!polling) {
    try {
      source = new EventSourceImpl(`${baseUrl}/agent/stream?id=${encodeURIComponent(jobId)}`);
      source.onmessage = (event) => { try { deliver(JSON.parse(event.data)); } catch {} };
      // The server ends the stream when the run settles; any error switches to polling immediately and
      // delivers that fallback status to a pending next() caller instead of stalling until quietMs.
      source.onerror = () => {
        source?.close(); source = null;
        if (closed) return;
        polling = true;
        if (waiter) poll(0).then(deliver, fail);
      };
    } catch { polling = true; }
  }
  return {
    async next() {
      if (queue.length) { const latest = queue[queue.length - 1]; queue.length = 0; return latest; }
      if (polling) return poll(pollMs);
      return new Promise((resolve, reject) => {
        const entry = {
          resolve,
          reject,
          // A quiet stream is fine, but never wait forever: check the status every few seconds anyway.
          timer: setTimeout(() => { if (waiter === entry) { waiter = null; poll(0).then(resolve, reject); } }, quietMs),
        };
        waiter = entry;
      });
    },
    close() {
      closed = true;
      if (waiter) { clearTimeout(waiter.timer); waiter = null; }
      source?.close(); source = null;
    },
  };
}
