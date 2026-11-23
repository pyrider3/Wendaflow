// Talks to a running Wendaflow from another process (the MCP server, the CLI).
// The address and token come from the discovery file the server writes at start,
// or from WENDAFLOW_URL + WENDAFLOW_AGENT_TOKEN.
import { readFile } from 'node:fs/promises';
import { discoveryFile } from './discovery.mjs';

export class WendaflowError extends Error {}

export function createClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let cached = null;
  async function target(fresh = false) {
    if (env.WENDAFLOW_URL && env.WENDAFLOW_AGENT_TOKEN) return { url: env.WENDAFLOW_URL.replace(/\/$/, ''), token: env.WENDAFLOW_AGENT_TOKEN };
    if (cached && !fresh) return cached;
    const file = discoveryFile(env);
    try { const info = JSON.parse(await readFile(file, 'utf8')); cached = { url: String(info.url).replace(/\/$/, ''), token: String(info.token) }; return cached; }
    catch { throw new WendaflowError(`找不到正在运行的 Wendaflow（${file}）。请先启动：npm run app（或 npm run proxy）。Wendaflow is not running.`); }
  }
  async function call(method, args = {}, retry = true) {
    const { url, token } = await target(!retry);
    let response;
    try {
      response = await fetchImpl(`${url}/agent-api/v1/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(args) });
    } catch (error) {
      if (retry) { cached = null; return call(method, args, false); }
      throw new WendaflowError(`无法连接 Wendaflow（${url}）：${error.cause?.code || error.message}。请确认 npm run app 正在运行。`);
    }
    // The server rotates its token on every start; re-read the discovery file once.
    if (response.status === 401 && retry) { cached = null; return call(method, args, false); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new WendaflowError(body.error || `HTTP ${response.status}`);
    return body;
  }
  return { call, target };
}
