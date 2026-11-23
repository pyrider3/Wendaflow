// Wires the agent API into the local server: storage, token, discovery file.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createAgentHub, ConflictError } from './hub.mjs';
import { createAgentService } from './service.mjs';
import { createAgentRoutes } from './routes.mjs';
import { discoveryFile } from './discovery.mjs';

export { ConflictError, discoveryFile };

export function agentApiEnabled({ publicWeb = false, env = process.env } = {}) {
  if (publicWeb) return false; // never on a public deployment
  return env.WENDAFLOW_AGENT_API !== '0';
}

async function defaultPng(svg, width, height) {
  let sharp;
  try { sharp = (await import('sharp')).default; } catch { throw Object.assign(new Error('服务器未安装 sharp，无法导出 PNG；请改用 svg，或运行 npm install'), { status: 501 }); }
  return sharp(Buffer.from(svg), { density: 144 }).resize(width, height).png().toBuffer();
}

export function createAgentApi({ canvasDir, save, env = process.env, renderPng = defaultPng, streamers, commandTimeout, streamInterval }) {
  const load = async (id) => {
    try { return JSON.parse(await readFile(path.join(canvasDir, `${id}.wdf`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const listCanvases = async () => {
    await mkdir(canvasDir, { recursive: true });
    const out = [];
    for (const file of (await readdir(canvasDir)).filter(name => name.endsWith('.wdf'))) {
      try { const item = JSON.parse(await readFile(path.join(canvasDir, file), 'utf8')); out.push({ id: item.canvas?.id || file.slice(0, -4), name: item.canvas?.name || '', updatedAt: item.canvas?.updatedAt, nodeCount: item.nodes?.length || 0, revision: item.agentRevision || 0 }); } catch {}
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  };
  const hub = createAgentHub({ load, save, ...(commandTimeout ? { commandTimeout } : {}) });
  const service = createAgentService({ hub, listCanvases, env, renderPng, streamers, ...(streamInterval ? { streamInterval } : {}) });
  const token = env.WENDAFLOW_AGENT_TOKEN || randomBytes(24).toString('base64url');
  const file = discoveryFile(env);
  let published = false;
  // Called once the server listens: agents read the address and token from here.
  async function publish(url) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ url, token, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    await chmod(file, 0o600).catch(() => {});
    published = true;
  }
  const handle = createAgentRoutes({ hub, service, token: () => token });
  const cleanup = async () => { hub.close(); if (published) { try { const current = JSON.parse(await readFile(file, 'utf8')); if (current.pid === process.pid) await rm(file, { force: true }); } catch {} } };
  return { hub, service, handle, publish, token: () => token, discovery: file, cleanup };
}
