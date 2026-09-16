import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, readFile, readdir, mkdir, unlink, rm, stat, copyFile } from 'node:fs/promises';

const HOST = '127.0.0.1';
const PORT = Number(process.env.WONDERFUL_PORT || 4318);
const DATA_ROOT = process.env.WONDERFUL_DATA_DIR || process.cwd();
const CANVAS_DIR = path.join(DATA_ROOT, 'data', 'canvases');
const DSH_BIN = process.env.DSH_CLI || path.join(os.homedir(), 'Documents', 'Codex', '2026-08-21', 'new-chat', 'work', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js');
const agentJobs = new Map();
const HARNESS_WEB_PORT = Number(process.env.WONDERFUL_HARNESS_PORT || 43178);
let harnessWebChild = null;
let harnessWebReady = null;
// The desktop app loads its UI from file://, while the browser build uses Vite.
// This server is loopback-only, so either local client may access it safely.
const allowedHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };

function reply(res, status, body) {
  res.writeHead(status, { ...allowedHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}

async function findCommand(names) {
  if (process.platform !== 'win32') {
    for (const name of names) {
      const found = await new Promise((resolve) => {
        const child = spawn('which', [name], { shell: false }); let output = '';
        child.stdout.on('data', (chunk) => { output += chunk; });
        child.on('error', () => resolve(null));
        child.on('close', (code) => resolve(code === 0 ? output.trim().split(/\r?\n/)[0] || null : null));
      });
      if (found) return found;
    }
    return null;
  }
  for (const name of names) {
    const found = await new Promise((resolve) => {
      const child = spawn('where.exe', [name], { windowsHide: true, shell: false });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.on('error', () => resolve(null));
      child.on('close', (code) => resolve(code === 0 ? output.split(/\r?\n/).find(Boolean)?.trim() || null : null));
    });
    if (found) return found;
  }
  return null;
}

function openWithSystemApplication(target, { reveal = false } = {}) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', reveal ? ['-R', target] : [target], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
}

async function resolveHarnessBin() {
  const roots = [process.env.DSH_CLI, DSH_BIN,
    path.join(os.homedir(), 'Documents', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js'),
    path.join(process.cwd(), 'node_modules', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')];
  const found = await firstExistingPath(roots);
  if (!found) throw new Error('找不到 DeepSeek Harness CLI。请在行动配置中确认已安装，或设置 DSH_CLI 到 bin.js 的完整路径。');
  return found;
}

function validateEndpoint(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('仅允许 HTTP(S) 模型接口');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('非本机接口必须使用 HTTPS');
  return url;
}

function eventText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(eventText).filter(Boolean).join('\n');
  if (typeof value === 'object') return value.text || value.summary || value.content || value.output || value.aggregated_output || value.command || value.cmd || value.path || value.file || '';
  return String(value);
}

function emitAgentTerminalEvents(text, hooks = {}) {
  for (const line of String(text || '').split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      const item = event.item || event;
      const type = item.type || event.type || '';
      if (type === 'reasoning' || type === 'reasoning_summary') {
        hooks.onEvent?.('thinking', eventText(item) || '正在分析下一步');
      } else if (type === 'command_execution' || type === 'command') {
        const command = eventText(item.command || item.cmd || item.text) || '运行命令';
        const output = eventText(item.aggregated_output || item.output);
        hooks.onEvent?.('command', output ? `${command}\n${output}` : command);
      } else if (type === 'file_change' || type === 'file_update') {
        hooks.onEvent?.('file', eventText(item.path || item.file || item.changes || item.text) || '修改文件');
      } else if (type === 'agent_message') {
        hooks.onEvent?.('message', eventText(item) || eventText(event.text) || '正在生成说明');
      } else if (event.type === 'system') {
        const label = event.subtype === 'init' ? 'Claude Code 已就绪' : event.subtype === 'status' ? 'Claude Code 状态已更新' : eventText(event) || 'Claude Code 系统事件';
        hooks.onEvent?.('status', label);
      } else if (event.type === 'assistant' || event.type === 'stream_event') {
        const delta = event.event?.delta?.text || event.delta?.text || event.message?.content?.map?.(eventText).join('\n') || eventText(event.message) || eventText(event);
        if (delta) hooks.onEvent?.('message', delta);
      } else if (event.type === 'tool_use' || event.type === 'tool_result') {
        hooks.onEvent?.('command', eventText(event.tool_input || event.input || event.content || event));
      } else if (type === 'thread.started' || type === 'turn.started' || type === 'turn.completed' || type === 'item.started' || type === 'item.completed') {
        // Codex JSONL wraps the actionable item in `item`; retain lifecycle
        // frames too so the timeline agrees with its CLI instead of inventing
        // generic "terminal output" rows.
        hooks.onEvent?.('status', eventText(item) || type.replace('.', ' · '));
      } else {
        hooks.onEvent?.('terminal', line);
      }
    } catch { hooks.onEvent?.('terminal', line); }
  }
}

function createAgentEventDecoder(hooks = {}) {
  let pending = '';
  return {
    push(chunk) {
      pending += String(chunk || '');
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      if (lines.length) emitAgentTerminalEvents(lines.join('\n'), hooks);
    },
    flush() {
      if (pending.trim()) emitAgentTerminalEvents(pending, hooks);
      pending = '';
    },
  };
}

function harnessText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(harnessText).filter(Boolean).join('\n');
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.content)) return harnessText(value.content);
  if (Array.isArray(value.message?.content)) return harnessText(value.message.content);
  return value.text || value.output || value.summary || value.message || value.result || '';
}

function relayHarnessFrame(frame, sessionId, hooks = {}) {
  if (!frame || frame.sessionId !== sessionId) return '';
  if (frame.type === 'host/session-status') {
    hooks.onEvent?.('status', frame.running ? 'Harness 正在执行' : 'Harness 已完成');
    return frame.running ? 'running' : 'done';
  }
  if (frame.type !== 'session/event') return '';
  const event = frame.event || {};
  const data = event.data || {};
  if (event.type === 'assistant/chunk') {
    const chunk = data.chunk || {};
    const text = chunk.text || '';
    if (text) hooks.onEvent?.(chunk.type === 'reasoning-delta' ? 'thinking' : 'message', text);
  } else if (event.type === 'assistant/message') {
    const blocks = data.message?.content || data.content || [];
    const visible = blocks.filter((block) => block?.type !== 'reasoning').map(harnessText).filter(Boolean).join('\n');
    const reasoning = blocks.filter((block) => block?.type === 'reasoning').map(harnessText).filter(Boolean).join('\n');
    if (reasoning) hooks.onEvent?.('thinking', reasoning);
    if (visible) hooks.onEvent?.('message', visible);
  } else if (event.type === 'tool/call') {
    hooks.onEvent?.('command', `${data.name || '工具'}${data.arguments ? `\n${data.arguments}` : ''}`);
  } else if (event.type === 'tool/result') {
    const text = harnessText(data.message || data.result || data);
    hooks.onEvent?.('command', text || '工具已返回结果');
  } else if (event.type === 'command/run' || event.type === 'command/done') {
    hooks.onEvent?.('command', harnessText(data) || event.type);
  }
  return '';
}

async function waitForHarnessWeb() {
  const origin = `http://${HOST}:${HARNESS_WEB_PORT}`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(800) });
      if (response.ok) return origin;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('DeepSeek Harness Web/API 服务启动超时');
}

async function ensureHarnessWeb() {
  const origin = `http://${HOST}:${HARNESS_WEB_PORT}`;
  try {
    const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(500) });
    if (response.ok) return origin;
  } catch {}
  if (!harnessWebReady) {
    const harnessBin = await resolveHarnessBin();
    harnessWebChild = spawn(process.execPath, [harnessBin, '--profile', 'web', '--no-open', '--host', HOST, '--port', String(HARNESS_WEB_PORT), '--trusted-host', `${HOST}:${HARNESS_WEB_PORT}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    harnessWebChild.on('error', () => { harnessWebReady = null; harnessWebChild = null; });
    harnessWebChild.on('close', () => { harnessWebReady = null; harnessWebChild = null; });
    harnessWebReady = waitForHarnessWeb().catch((error) => { harnessWebReady = null; throw error; });
  }
  return harnessWebReady;
}

async function harnessRpc(origin, method, payload, signal) {
  const rpcId = `wonderful-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Harness' browser transport uses an RPC envelope even for unary HTTP
    // calls.  Posting only the payload looks like an unknown route to it.
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`Harness API ${method} 返回 ${response.status}${detail ? `：${detail}` : ''}`);
  }
  const body = await response.json();
  if (!body?.result?.ok) throw new Error(body?.result?.error?.message || `Harness API ${method} 请求失败`);
  return body.result.value;
}

function openHarnessMux(origin, sessionId, hooks, signal, onError) {
  const endpoint = `${origin.replace(/^http/, 'ws')}/api/events.mux`;
  let socket;
  let opened = false;
  let closed = false;
  const ready = new Promise((resolve, reject) => {
    try {
      socket = new WebSocket(endpoint);
      socket.addEventListener('open', () => { opened = true; resolve(); });
      socket.addEventListener('message', (event) => {
        try {
          const frame = JSON.parse(String(event.data));
          const payload = frame.payload || frame;
          if (payload.type === 'stream/error') onError(payload.error?.message || 'Harness 事件流错误');
          relayHarnessFrame(payload, sessionId, hooks);
        } catch (error) { onError(error.message); }
      });
      socket.addEventListener('error', () => {
        const error = new Error('无法连接 DeepSeek Harness 实时事件流');
        if (!opened) reject(error);
        else onError(error.message);
      });
      socket.addEventListener('close', () => {
        if (!closed && !signal.aborted) onError('DeepSeek Harness 实时事件流已断开');
      });
    } catch (error) { reject(error); }
  });
  const close = () => {
    closed = true;
    try { socket?.close(); } catch {}
  };
  signal.addEventListener('abort', close, { once: true });
  return { ready, close };
}

async function runHarnessWeb(prompt, images = [], files = [], workspace = process.cwd(), hooks = {}, options = {}) {
  const resolvedWorkspace = path.resolve(workspace || process.cwd());
  if (!(await stat(resolvedWorkspace)).isDirectory()) throw new Error('行动工作目录不是有效文件夹');
  const origin = await ensureHarnessWeb();
  const controller = new AbortController();
  hooks.onAbort?.(() => controller.abort());
  const session = await harnessRpc(origin, 'session.create', { cwd: resolvedWorkspace }, controller.signal);
  const sessionId = session.sessionId;
  let finalOutput = '';
  let streamError = null;
  let settled = false;
  const mux = openHarnessMux(origin, sessionId, hooks, controller.signal, (error) => { streamError ||= error; });
  await mux.ready;
  const attachmentSet = await materializeAttachments([...images, ...files], resolvedWorkspace);
  const attachmentNotice = attachmentSet.paths.length
    ? `\n\nWendaflow 已将附件保存到以下路径。请实际打开并读取它们：\n${attachmentSet.paths.map((item) => `- ${item.name}: ${item.path}`).join('\n')}`
    : '';
  const parts = [{ type: 'text', text: `${prompt}${attachmentNotice}` }];
  for (const item of images) {
    const match = item.dataUrl?.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s);
    if (match && String(match[1]).startsWith('image/')) parts.push({ type: 'image', mediaType: match[1], data: match[2], name: item.name || 'image' });
  }
  await harnessRpc(origin, 'session.prompt', { sessionId, mode: 'queue', content: parts, clientTimeZone: 'Asia/Shanghai' }, controller.signal);
  const deadline = Date.now() + 15 * 60_000;
  // `events.mux` carries the detailed per-session log while running state is
  // intentionally published on the separate host stream. Poll the session
  // summary for that one bit so completion cannot depend on UI-only events.
  let sawRunning = false;
  const promptStartedAt = Date.now();
  while (!settled && !controller.signal.aborted && Date.now() < deadline) {
    try {
      const listing = await harnessRpc(origin, 'session.list', {}, controller.signal);
      const summary = (listing.items || []).find((item) => item.sessionId === sessionId);
      if (summary?.running) sawRunning = true;
      else if (sawRunning || Date.now() - promptStartedAt > 900) settled = true;
    } catch (error) { streamError ||= error.message; }
    if (!settled) await new Promise((resolve) => setTimeout(resolve, 180));
  }
  mux.close();
  if (attachmentSet.tempDir) await rm(attachmentSet.tempDir, { recursive: true, force: true });
  if (streamError) throw new Error(streamError);
  if (!settled) throw new Error('DeepSeek Harness 任务超时或已停止');
  const history = await harnessRpc(origin, 'session.history', { sessionId, maxMessages: 100 }, undefined);
  for (const item of history.events || []) {
    if (item.event?.type !== 'assistant/message') continue;
    const blocks = item.event.data?.message?.content || [];
    const text = blocks.filter((block) => block?.type !== 'reasoning').map(harnessText).filter(Boolean).join('\n');
    if (text) finalOutput = text;
  }
  return { output: finalOutput || 'DeepSeek Harness 已完成任务。', terminal: `Harness Web session: ${sessionId}` };
}

async function readJson(req, limit = 12_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function responseInput(messages) {
  return messages.map(({ role, content, images, files }) => (images?.length || files?.length) && role === 'user' ? { role, content: [{ type: 'input_text', text: content }, ...(images || []).map((image) => ({ type: 'input_image', image_url: image.dataUrl })), ...(files || []).map((file) => ({ type: 'input_file', filename: file.name, file_data: file.dataUrl }))] } : { role, content });
}

function compatibleInput(messages) {
  return messages.map(({ role, content, images }) => images?.length && role === 'user' ? { role, content: [{ type: 'text', text: content }, ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))] } : { role, content });
}

function anthropicInput(messages) {
  return messages.map(({ role, content, images, files }) => (images?.length || files?.length) && role === 'user' ? { role, content: [{ type: 'text', text: content }, ...(images || []).map((image) => { const [meta, data] = image.dataUrl.split(','); return { type: 'image', source: { type: 'base64', media_type: meta.match(/^data:([^;]+)/)?.[1] || 'image/png', data } }; }), ...(files || []).filter((file) => file.type === 'application/pdf').map((file) => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.dataUrl.split(',')[1] } }))] } : { role, content });
}

function geminiInput(messages) {
  return messages.map(({ role, content, images, files }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }, ...[...(images || []), ...(files || [])].map((file) => { const [meta, data] = file.dataUrl.split(','); return { inline_data: { mime_type: meta.match(/^data:([^;]+)/)?.[1] || file.type || 'application/octet-stream', data } }; })] }));
}

function safeAttachmentName(name, index) {
  const cleaned = path.basename(String(name || `attachment-${index + 1}`)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return `${String(index + 1).padStart(2, '0')}-${cleaned || `attachment-${index + 1}`}`;
}

async function hydrateCanvasAttachments(payload, id) {
  const assetDir = path.join(CANVAS_DIR, `${id}.assets`);
  for (const node of payload.nodes || []) {
    for (const attachment of node.attachments || []) {
      if (!attachment.assetRef || attachment.dataUrl) continue;
      const safeRef = path.basename(attachment.assetRef);
      if (safeRef !== attachment.assetRef) continue;
      try {
        const data = await readFile(path.join(assetDir, safeRef));
        attachment.dataUrl = `data:${attachment.type || 'application/octet-stream'};base64,${data.toString('base64')}`;
      } catch {}
    }
  }
  return payload;
}

async function materializeAttachments(items = [], persistentRoot = '') {
  if (!items.length) return { tempDir: null, attachmentDir: null, paths: [] };
  const attachmentDir = persistentRoot
    ? path.join(path.resolve(persistentRoot), '.wonderful', 'agent-files', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    : await mkdtemp(path.join(os.tmpdir(), 'wonderful-agent-files-'));
  if (persistentRoot) await mkdir(attachmentDir, { recursive: true });
  const paths = [];
  for (const [index, item] of items.slice(0, 20).entries()) {
    const match = item.dataUrl?.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s);
    const filePath = path.join(attachmentDir, safeAttachmentName(item.name, index));
    if (match) await writeFile(filePath, Buffer.from(match[2], 'base64'));
    else if (item.sourcePath) {
      const sourcePath = path.resolve(String(item.sourcePath));
      const sourceInfo = await stat(sourcePath);
      if (!sourceInfo.isFile()) continue;
      await copyFile(sourcePath, filePath);
    } else continue;
    paths.push({ path: filePath, name: item.name || path.basename(filePath), type: item.type || match?.[1] || 'application/octet-stream', image: String(item.dataUrl).startsWith('data:image/') });
  }
  return { tempDir: persistentRoot ? null : attachmentDir, attachmentDir, paths };
}

async function runCodex(prompt, images = [], files = [], workspace = process.cwd(), hooks = {}, options = {}) {
  const resolvedWorkspace = path.resolve(workspace || process.cwd());
  if (!(await stat(resolvedWorkspace)).isDirectory()) throw new Error('Codex 工作目录不是有效文件夹');
  const { tempDir, attachmentDir, paths: attachmentPaths } = await materializeAttachments([...images, ...files], resolvedWorkspace);
  const imagePaths = attachmentPaths.filter((item) => item.image).map((item) => item.path);
  const filePaths = attachmentPaths.filter((item) => !item.image);
  const effectivePrompt = filePaths.length ? `${prompt}\n\nWendaflow 已将用户上传的文件保存到以下本地路径。你必须实际读取这些文件后再回答：\n${filePaths.map((item) => `- ${item.name}: ${item.path}`).join('\n')}` : prompt;
  try {
    return await new Promise((resolve, reject) => {
    const codexScript = process.platform === 'win32' ? path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : null;
    const executable = codexScript ? process.execPath : 'codex';
    const accessMode = ['read-only', 'workspace-write', 'auto-review', 'full-access'].includes(options.accessMode) ? options.accessMode : (options.sandbox || 'workspace-write');
    const reasoning = ['low', 'medium', 'high', 'xhigh'].includes(options.reasoning) ? options.reasoning : 'high';
    const permissionArgs = accessMode === 'full-access' ? ['--dangerously-bypass-approvals-and-sandbox'] : ['--sandbox', accessMode === 'read-only' ? 'read-only' : 'workspace-write', ...(accessMode === 'auto-review' ? ['--approve-for-me'] : [])];
    const args = [...(codexScript ? [codexScript] : []), 'exec', '--json', ...(options.ephemeral === false ? [] : ['--ephemeral']), '--skip-git-repo-check', ...permissionArgs, ...(options.profile ? ['--profile', String(options.profile)] : []), ...(options.model ? ['--model', String(options.model)] : []), '-c', `model_reasoning_effort="${reasoning}"`, '-C', resolvedWorkspace, ...(attachmentDir ? ['--add-dir', attachmentDir] : []), ...(options.addDir ? ['--add-dir', path.resolve(String(options.addDir))] : []), ...(imagePaths.length ? ['-i', ...imagePaths] : []), '-'];
    // Electron itself has no console. A console program spawned directly from
    // that process can make grandchildren (PowerShell/cmd used by Codex tools)
    // create a visible console for a moment. Keep one hidden PowerShell host
    // for the whole command tree so every tool inherits the hidden console.
    const psQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
    const launch = process.platform === 'win32'
      ? { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `& ${psQuote(executable)} ${args.map(psQuote).join(' ')}; exit $LASTEXITCODE`] }
      : { command: executable, args };
    const child = spawn(launch.command, launch.args, { windowsHide: true, shell: false, detached: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(codexScript ? { ELECTRON_RUN_AS_NODE: '1' } : {}), FORCE_COLOR: '0', NO_COLOR: '1', CI: '1', TERM: 'dumb' } });
    hooks.onChild?.(child);
    let stdout = '', stderr = '';
    child.stdin.end(effectivePrompt);
    const decoder = createAgentEventDecoder(hooks);
    child.stdout.on('data', (chunk) => { const text = chunk.toString(); decoder.push(text); if (stdout.length < 2_000_000) stdout += text; });
    child.stderr.on('data', (chunk) => { const text = chunk.toString(); hooks.onEvent?.('stderr', text); if (stderr.length < 20_000) stderr += text; });
    child.on('error', reject);
    child.on('close', (code) => {
      decoder.flush();
      const messages = stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => { try { const event = JSON.parse(line); const text = event.item?.type === 'agent_message' ? event.item.text : event.type === 'agent_message' ? event.text : ''; return text ? [text] : []; } catch { return []; } });
      if (code !== 0) reject(new Error(stderr.trim() || `Codex 退出码 ${code}`));
      else resolve({ output: messages.at(-1) || 'Codex 已完成任务。', terminal: stdout.split(/\r?\n/).filter(Boolean).slice(-80).join('\n') });
    });
    });
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

async function runCliAgent(runner, prompt, images = [], files = [], workspace = process.cwd(), hooks = {}, options = {}) {
  const resolvedWorkspace = path.resolve(workspace || process.cwd());
  if (!(await stat(resolvedWorkspace)).isDirectory()) throw new Error('行动工作目录不是有效文件夹');
  // Headless only prints a completed transcript.  The Web/API session exposes
  // the same event sequence as Harness' own client, including tool calls and
  // incremental assistant/reasoning chunks.
  if (runner === 'deepseek') return runHarnessWeb(prompt, images, files, resolvedWorkspace, hooks, options);
  const { tempDir, paths: attachmentPaths } = await materializeAttachments([...images, ...files], resolvedWorkspace);
  const effectivePrompt = attachmentPaths.length ? `${prompt}\n\nWendaflow 已将用户上传的附件保存到以下本地路径。你必须实际打开并读取它们；图片也需要通过这些路径查看：\n${attachmentPaths.map((item) => `- ${item.name}: ${item.path}`).join('\n')}` : prompt;
  const claudeCommand = process.env.CLAUDE_CLI || await findCommand(process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']);
  const definitions = {
    // On Windows the npm CLI is a .cmd shim. Spawning the bare name with a
    // shell gives inconsistent quoting and often fails only from Electron.
    claude: { command: claudeCommand, args: ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', ...(options.maxTurns ? ['--max-turns', String(options.maxTurns)] : []), ...(options.model ? ['--model', String(options.model)] : []), ...(options.permissionMode && options.permissionMode !== 'default' ? ['--permission-mode', String(options.permissionMode)] : [])], stdin: true, shell: process.platform === 'win32' },
  };
  const definition = definitions[runner];
  if (!definition) throw new Error('不支持的行动执行器');
  if (!definition.command) throw new Error('找不到 Claude Code CLI。请安装 Claude Code，或设置环境变量 CLAUDE_CLI 为可执行文件路径。');
  try { return await new Promise((resolve, reject) => {
    const child = spawn(definition.command, definition.args, { cwd: resolvedWorkspace, windowsHide: true, shell: definition.shell ?? process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } });
    hooks.onChild?.(child);
    let stdout = '', stderr = '';
    if (definition.stdin) child.stdin.end(effectivePrompt); else child.stdin.end();
    const decoder = createAgentEventDecoder(hooks);
    child.stdout.on('data', (chunk) => { const text = chunk.toString(); decoder.push(text); if (stdout.length < 2_000_000) stdout += text; });
    child.stderr.on('data', (chunk) => { const text = chunk.toString(); hooks.onEvent?.('stderr', text); if (stderr.length < 40_000) stderr += text; });
    child.on('error', (error) => reject(new Error(`${definition.command} 无法启动：${error.message}`)));
    child.on('close', (code) => {
      decoder.flush();
      if (code === 0) {
        const messages = stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
          try {
            const event = JSON.parse(line);
            const text = event.result || event.message?.content?.map?.(harnessText).join('\n') || event.message?.text || event.text || '';
            return text ? [String(text)] : [];
          } catch { return []; }
        });
        resolve({ output: messages.at(-1) || stdout.trim() || `${runner} 已完成任务。`, terminal: [stdout, stderr].filter(Boolean).join('\n').slice(-80_000) });
      }
      else {
        const transcript = [stdout, stderr].filter(Boolean).join('\n');
        if (/not logged in|please run\s+\/login/i.test(transcript)) reject(new Error('Claude Code 尚未登录。请先在 PowerShell 运行 claude，并在 Claude Code 中执行 /login 完成授权；随后回到 Wendaflow 重试。'));
        else reject(new Error(stderr.trim() || `${definition.command} 退出码 ${code}`));
      }
    });
  }); } finally { if (tempDir) await rm(tempDir, { recursive: true, force: true }); }
}

async function gitWorkspaceState(workspace) {
  const cwd = path.resolve(workspace || process.cwd());
  const run = (args) => new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true, shell: false });
    let output = '';
    child.stdout.on('data', (chunk) => { if (output.length < 1_000_000) output += chunk; });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(output.trim()));
  });
  return { status: await run(['status', '--short']), diff: await run(['diff', '--no-ext-diff', '--']), stagedDiff: await run(['diff', '--cached', '--no-ext-diff', '--']) };
}

function artifactMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.zip': 'application/zip' })[extension] || 'application/octet-stream';
}

async function collectRecentArtifacts(root, startedAt, add) {
  const started = new Date(startedAt || 0).getTime() - 2_000;
  const accepted = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.pptx', '.docx', '.xlsx', '.zip', '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html']);
  const walk = async (directory, depth = 0) => {
    if (depth > 4) return;
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.wonderful') continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(candidate, depth + 1); continue; }
      if (!entry.isFile() || !accepted.has(path.extname(entry.name).toLowerCase())) continue;
      try { if ((await stat(candidate)).mtimeMs >= started) add(candidate, '本次生成'); } catch {}
    }
  };
  await walk(root);
}

async function collectJobArtifacts(workspace, after = {}, output = '', startedAt = null) {
  const root = path.resolve(workspace || process.cwd());
  const candidates = new Map();
  const add = (candidate, state) => {
    if (!candidate) return;
    const cleaned = String(candidate).trim().replace(/^["'`]+|["'`。；，,]+$/g, '');
    const absolute = path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(root, cleaned);
    if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) return;
    candidates.set(absolute, state);
  };
  for (const line of String(after.status || '').split(/\r?\n/)) {
    const match = line.match(/^(.{1,2})\s+(.+)$/);
    if (match) add(match[2].split(' -> ').at(-1), match[1].includes('?') || match[1].includes('A') ? '新增文件' : match[1].includes('D') ? '已删除' : '已修改');
  }
  const pathPattern = /(?:[A-Za-z]:[\\/]|\.?(?:[\\/]))[^\r\n<>|*?"']+?\.(?:png|jpe?g|webp|gif|svg|pdf|pptx|docx|xlsx|zip|txt|md|json|js|jsx|ts|tsx|css|html)/gi;
  for (const match of String(output).matchAll(pathPattern)) add(match[0], '生成文件');
  // CLI agents often report only a filename (“已保存为 xxx.md”) rather than
  // an absolute path. Probe these names inside the approved workspace.
  const bareFilePattern = /(?:^|[\s“”"'：:（(])([^\\/\r\n<>|*?"']+?\.(?:png|jpe?g|webp|gif|svg|pdf|pptx|docx|xlsx|zip|txt|md|json|js|jsx|ts|tsx|css|html))(?:[\s，,。；;）)]|$)/gi;
  for (const match of String(output).matchAll(bareFilePattern)) add(match[1], '生成文件');
  await collectRecentArtifacts(root, startedAt, add);
  const artifacts = [];
  for (const [filePath, state] of candidates) {
    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      const type = artifactMime(filePath);
      artifacts.push({ path: filePath, name: path.basename(filePath), size: info.size, type, image: type.startsWith('image/'), state });
    } catch {}
  }
  return artifacts.slice(0, 24);
}

function publicJob(job) {
  return { id: job.id, runner: job.runner, status: job.status, startedAt: job.startedAt, completedAt: job.completedAt, events: job.events.slice(-240), terminal: job.terminal || '', output: job.output, error: job.error, before: job.before, after: job.after, artifacts: (job.artifacts || []).map((item, index) => ({ id: `${job.id}-${index}`, name: item.name, size: item.size, type: item.type, image: item.image, state: item.state, localPath: item.path, url: `http://${HOST}:${PORT}/agent/artifact?job=${encodeURIComponent(job.id)}&index=${index}` })) };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, allowedHeaders); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') { reply(res, 200, { ok: true, service: 'branchspace-local-proxy' }); return; }
  if (req.method === 'GET' && req.url === '/canvases') {
    try {
      await mkdir(CANVAS_DIR, { recursive: true });
      const files = (await readdir(CANVAS_DIR)).filter((name) => name.endsWith('.wdf'));
      const canvases = [];
      for (const file of files) {
        try {
          const item = JSON.parse(await readFile(path.join(CANVAS_DIR, file), 'utf8'));
          canvases.push({ id: item.canvas?.id || file.slice(0, -4), name: item.canvas?.name || '未命名画布', createdAt: item.canvas?.createdAt, updatedAt: item.canvas?.updatedAt, nodeCount: item.nodes?.length || 0 });
        } catch {}
      }
      canvases.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      reply(res, 200, { canvases });
    } catch (error) { reply(res, 500, { error: error.message }); }
    return;
  }
  if (req.method === 'GET' && req.url?.startsWith('/canvases/open?')) {
    try {
      const id = new URL(req.url, `http://${HOST}`).searchParams.get('id');
      if (!/^[a-zA-Z0-9_-]+$/.test(id || '')) throw new Error('画布 ID 无效');
      const payload = JSON.parse(await readFile(path.join(CANVAS_DIR, `${id}.wdf`), 'utf8'));
      reply(res, 200, await hydrateCanvasAttachments(payload, id));
    } catch (error) { reply(res, 404, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/canvases/save') {
    try {
      // WDF archives may embed images, presentations and PDFs as base64. The
      // browser cache no longer carries these payloads, but explicit local
      // saves must accept realistically sized projects.
      const payload = await readJson(req, 1_000_000_000);
      const id = payload.canvas?.id;
      if (!/^[a-zA-Z0-9_-]+$/.test(id || '')) throw new Error('画布 ID 无效');
      await mkdir(CANVAS_DIR, { recursive: true });
      // WDF is deliberately self-contained so moving one file between devices
      // preserves nodes, layout and every attachment. IndexedDB is only the
      // browser's working cache and is not part of the portable file format.
      await writeFile(path.join(CANVAS_DIR, `${id}.wdf`), JSON.stringify(payload, null, 2), 'utf8');
      // Migrate the short-lived split-asset format back into a single archive.
      await rm(path.join(CANVAS_DIR, `${id}.assets`), { recursive: true, force: true });
      reply(res, 200, { ok: true });
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/canvases/delete') {
    try {
      const { id } = await readJson(req);
      if (!/^[a-zA-Z0-9_-]+$/.test(id || '')) throw new Error('画布 ID 无效');
      await unlink(path.join(CANVAS_DIR, `${id}.wdf`));
      await rm(path.join(CANVAS_DIR, `${id}.assets`), { recursive: true, force: true });
      reply(res, 200, { ok: true });
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/pick-directory') {
    if (!['win32', 'darwin'].includes(process.platform)) { reply(res, 400, { error: '当前目录选择器仅支持桌面版 Windows 或 macOS' }); return; }
    const isMac = process.platform === 'darwin';
    const script = "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='选择 Wendaflow 行动工作目录'; if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output $d.SelectedPath}";
    // Native dialogs avoid a console flash on Windows and use Finder on macOS.
    const child = isMac
      ? spawn('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择 Wendaflow 行动工作目录")'], { shell: false })
      : spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true, shell: false });
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('close', (code) => code === 0 ? reply(res, 200, { path: output.trim() }) : reply(res, 400, { error: error.trim() || '目录选择已取消' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/open-directory') {
    try {
      const { workspace = '' } = await readJson(req);
      const target = path.resolve(workspace || process.cwd());
      const info = await stat(target);
      if (!info.isDirectory()) throw new Error('工作目录不存在');
      openWithSystemApplication(target);
      reply(res, 200, { ok: true });
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/agent/start') {
    try {
      const { runner = 'codex', prompt, images = [], files = [], workspace, options = {} } = await readJson(req, 90_000_000);
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('任务内容不能为空');
      const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job = { id, runner, status: 'running', startedAt: new Date().toISOString(), events: [{ id: 1, type: 'status', text: `${runner} 已启动`, at: new Date().toISOString() }], terminal: '', output: '', error: null, child: null, abort: null };
      agentJobs.set(id, job);
      reply(res, 202, publicJob(job));
      void (async () => {
        const addEvent = (type, text) => { const clean = String(text); job.events.push({ id: job.events.length + 1, type, text: clean.slice(-12000), at: new Date().toISOString() }); job.terminal = `${job.terminal || ''}${clean}`.slice(-180000); };
        try {
          job.before = await gitWorkspaceState(workspace);
          addEvent('status', '已记录执行前的工作区状态');
          const hooks = { onChild: (child) => { job.child = child; }, onAbort: (abort) => { job.abort = abort; }, onEvent: addEvent };
          addEvent('config', `执行配置：${JSON.stringify(options)}`);
          const safeImages = Array.isArray(images) ? images : [], safeFiles = Array.isArray(files) ? files : [];
          const result = runner === 'codex' ? await runCodex(prompt.trim(), safeImages, safeFiles, workspace, hooks, options) : await runCliAgent(runner, prompt.trim(), safeImages, safeFiles, workspace, hooks, options);
          if (job.status === 'stopped') return;
          job.output = result.output; job.terminal = result.terminal; job.after = await gitWorkspaceState(workspace); job.artifacts = await collectJobArtifacts(workspace, job.after, result.output, job.startedAt); job.status = 'done'; job.completedAt = new Date().toISOString(); addEvent('result', result.output); addEvent('status', '执行完成');
        } catch (error) {
          if (job.status === 'stopped') return;
          job.status = 'failed'; job.error = error.message; job.completedAt = new Date().toISOString(); addEvent('error', error.message);
        } finally { job.child = null; }
      })();
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'GET' && req.url?.startsWith('/agent/status?')) {
    const id = new URL(req.url, `http://${HOST}`).searchParams.get('id');
    const job = agentJobs.get(id); reply(res, job ? 200 : 404, job ? publicJob(job) : { error: '找不到任务' }); return;
  }
  if (req.method === 'GET' && req.url?.startsWith('/agent/artifact?')) {
    try {
      const url = new URL(req.url, `http://${HOST}`);
      const job = agentJobs.get(url.searchParams.get('job'));
      const index = Number(url.searchParams.get('index'));
      const artifact = job?.artifacts?.[index];
      if (!artifact || !Number.isInteger(index)) throw new Error('找不到行动产物');
      const data = await readFile(artifact.path);
      res.writeHead(200, { ...allowedHeaders, 'Content-Type': artifact.type, 'Content-Length': data.length, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}` });
      res.end(data);
    } catch (error) { reply(res, 404, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/agent/artifact/open') {
    try {
      const { job: jobId, artifactId, path: requestedPath } = await readJson(req);
      const job = agentJobs.get(jobId);
      const index = (job?.artifacts || []).findIndex((item, itemIndex) => `${jobId}-${itemIndex}` === artifactId);
      let artifact = index >= 0 ? job.artifacts[index] : null;
      if (!artifact && requestedPath) {
        const localPath = path.resolve(String(requestedPath));
        const info = await stat(localPath);
        if (info.isFile()) artifact = { path: localPath };
      }
      if (!artifact) throw new Error('找不到可打开的行动产物');
      openWithSystemApplication(artifact.path);
      reply(res, 200, { ok: true });
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/agent/stop') {
    try {
      const { id } = await readJson(req); const job = agentJobs.get(id); if (!job) throw new Error('找不到任务');
      job.status = 'stopped'; job.completedAt = new Date().toISOString(); job.events.push({ id: job.events.length + 1, type: 'status', text: '用户已停止任务', at: job.completedAt });
      job.abort?.(); job.child?.kill(); reply(res, 200, publicJob(job));
    } catch (error) { reply(res, 404, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && (req.url === '/codex' || req.url === '/agent')) {
    try {
      const { runner = 'codex', prompt, images = [], files = [], workspace, options = {} } = await readJson(req, 90_000_000);
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('任务内容不能为空');
      const safeImages = Array.isArray(images) ? images : [], safeFiles = Array.isArray(files) ? files : [];
      const result = runner === 'codex' ? await runCodex(prompt.trim(), safeImages, safeFiles, workspace, {}, options) : await runCliAgent(runner, prompt.trim(), safeImages, safeFiles, workspace, {}, options);
      reply(res, 200, result);
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/stream') { reply(res, 404, { error: 'Not found' }); return; }
  try {
    const { endpoint, format, apiKey, model, messages, chatOptions = {} } = await readJson(req);
    const base = validateEndpoint(endpoint || (format === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : '')).toString().replace(/\/$/, '');
    const anthropic = format === 'anthropic';
    const gemini = format === 'gemini';
    const responses = format === 'responses';
    const target = gemini ? `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}` : `${base}${anthropic ? '/messages' : responses ? '/responses' : '/chat/completions'}`;
    const headers = anthropic
      ? { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
    const isDoubao = /doubao/i.test(model || '') || /(?:volces|volcengine)\.com/i.test(base);
    const isDeepSeek = /deepseek/i.test(model || '') || /api\.deepseek\.com/i.test(base);
    const reasoningEffort = chatOptions.reasoning === 'none' ? 'minimal' : chatOptions.reasoning;
    const body = gemini ? { contents: geminiInput(messages), generationConfig: { ...(Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : {}), ...(chatOptions.thinking ? { thinkingConfig: { thinkingBudget: -1 } } : {}) } } : anthropic
      ? { model, messages: anthropicInput(messages), max_tokens: 4096, stream: true }
      : responses ? { model, input: responseInput(messages), stream: true, store: false, ...((isDeepSeek || (chatOptions.reasoning && chatOptions.reasoning !== 'none')) ? { reasoning: { effort: isDeepSeek && chatOptions.reasoning === 'none' ? 'none' : chatOptions.reasoning } } : {}), ...(Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : {}) } : { model, messages: compatibleInput(messages), stream: true, ...(Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : {}), ...(isDoubao && reasoningEffort ? { reasoning_effort: reasoningEffort } : {}), ...(isDeepSeek ? { thinking: { type: chatOptions.reasoning === 'none' ? 'disabled' : 'enabled' } } : {}), ...(!isDoubao && !isDeepSeek && typeof chatOptions.thinking === 'boolean' ? { enable_thinking: chatOptions.thinking } : {}) };
    const upstream = await fetch(target, { method: 'POST', headers, body: JSON.stringify(body) });
    res.writeHead(upstream.status, { ...allowedHeaders, 'Content-Type': upstream.headers.get('content-type') || 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (!upstream.body) { res.end(); return; }
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (error) { reply(res, 400, { error: error.message }); }
});

server.listen(PORT, HOST, () => console.log(`Wendaflow local proxy: http://${HOST}:${PORT}`));
