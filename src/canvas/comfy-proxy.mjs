// Server-side bridge from server.mjs to a local ComfyUI. The browser never talks to
// ComfyUI directly (no CORS setup needed); every error comes back as a readable sentence.
import { readComfyHistory } from './comic.mjs';

export function comfyBase(endpoint) {
  let url;
  try { url = new URL(String(endpoint || 'http://127.0.0.1:8188')); } catch { throw new Error('ComfyUI 地址无效，例如 http://127.0.0.1:8188'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('ComfyUI 地址必须是 http(s)://主机:端口');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

async function call(base, path, init = {}, fetchImpl = fetch, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try { response = await fetchImpl(`${base}${path}`, { ...init, signal: controller.signal }); }
  catch (error) {
    const e = new Error(error?.name === 'AbortError' ? `ComfyUI（${base}）没有响应，请确认它已启动且未卡住` : `无法连接 ComfyUI（${base}）。请先启动 ComfyUI，或在 设置 → 漫剧 里改地址。`);
    e.status = 502; throw e;
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = body?.error?.message || body?.error || ''; const nodes = Object.values(body?.node_errors || {}).flatMap((n) => (n.errors || []).map((x) => `${n.class_type}: ${x.details || x.message}`)); if (nodes.length) detail = `${detail} ${nodes.slice(0, 3).join('；')}`.trim(); } catch { /* not JSON */ }
    const e = new Error(`ComfyUI 返回 ${response.status}${detail ? `：${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); e.status = 502; throw e;
  }
  return response;
}

export async function comfyStatus({ endpoint }, fetchImpl = fetch) {
  const base = comfyBase(endpoint);
  const stats = await (await call(base, '/system_stats', {}, fetchImpl, 5000)).json();
  let checkpoints = [];
  try {
    const info = await (await call(base, '/object_info/CheckpointLoaderSimple', {}, fetchImpl, 8000)).json();
    checkpoints = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
  } catch { /* older builds: still connected */ }
  return { ok: true, version: stats?.system?.comfyui_version || '', device: stats?.devices?.[0]?.name || '', checkpoints: Array.isArray(checkpoints) ? checkpoints : [] };
}

export async function comfySubmit({ endpoint, workflow, clientId = 'wendaflow' }, fetchImpl = fetch) {
  const base = comfyBase(endpoint);
  if (!workflow || typeof workflow !== 'object') throw Object.assign(new Error('缺少工作流'), { status: 400 });
  const result = await (await call(base, '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) }, fetchImpl)).json();
  if (!result?.prompt_id) throw Object.assign(new Error('ComfyUI 没有返回任务 ID'), { status: 502 });
  return { promptId: result.prompt_id, number: result.number ?? null };
}

export async function comfyProgress({ endpoint, promptId }, fetchImpl = fetch) {
  const base = comfyBase(endpoint);
  const id = String(promptId || '');
  if (!/^[\w-]{1,80}$/.test(id)) throw Object.assign(new Error('任务 ID 无效'), { status: 400 });
  const state = readComfyHistory(await (await call(base, `/history/${encodeURIComponent(id)}`, {}, fetchImpl)).json(), id);
  if (state.done) return state;
  let position = null, running = false;
  try {
    const queue = await (await call(base, '/queue', {}, fetchImpl, 5000)).json();
    running = (queue.queue_running || []).some((item) => item?.[1] === id);
    const pending = (queue.queue_pending || []).map((item) => item?.[1]);
    position = pending.includes(id) ? pending.indexOf(id) + 1 : null;
  } catch { /* progress text only */ }
  return { done: false, running, position };
}

export async function comfyImage({ endpoint, filename, subfolder = '', type = 'output' }, fetchImpl = fetch) {
  const base = comfyBase(endpoint);
  if (!filename || /[\\/]|\.\./.test(String(filename)) || /\.\./.test(String(subfolder))) throw Object.assign(new Error('图片文件名无效'), { status: 400 });
  const query = new URLSearchParams({ filename, subfolder, type }).toString();
  const response = await call(base, `/view?${query}`, {}, fetchImpl, 30000);
  const mime = (response.headers.get('content-type') || 'image/png').split(';')[0];
  if (!mime.startsWith('image/')) throw Object.assign(new Error('ComfyUI 返回的不是图片'), { status: 502 });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { name: filename, type: mime, size: bytes.length, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

// Routes for server.mjs: POST /comfy/{status,prompt,progress,image} with a JSON body.
export const comfyRoutes = { '/comfy/status': comfyStatus, '/comfy/prompt': comfySubmit, '/comfy/progress': comfyProgress, '/comfy/image': comfyImage };
