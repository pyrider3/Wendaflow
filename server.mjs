import {cloudApi} from './cloud/http.mjs';
import {validatePublicEndpoint,publicRequestAllowed} from './deployment/public-policy.mjs';
import http from 'node:http';
import {canvasStorage} from './canvas-storage.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, readFile, readdir, mkdir, unlink, rm, stat, copyFile, realpath } from 'node:fs/promises';

const PUBLIC_WEB = process.env.WENDAFLOW_PUBLIC === '1';
const HOST = '127.0.0.1';
const PORT = Number(process.env.WONDERFUL_PORT || 4318);
const DATA_ROOT = process.env.WONDERFUL_DATA_DIR || process.cwd();
const CANVAS_DIR = path.join(DATA_ROOT, 'data', 'canvases');
const canvasFiles = canvasStorage(DATA_ROOT);
const DSH_BIN = process.env.DSH_CLI || path.join(os.homedir(), 'Documents', 'Codex', '2026-08-21', 'new-chat', 'work', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js');
const agentJobs = new Map();
// The desktop app loads its UI from file://, while the browser build uses Vite.
// This server is loopback-only, so either local client may access it safely.
const allowedHeaders = PUBLIC_WEB ? {} : { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };

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
  // A global npm install (`npm i -g @deepseek-ai/dsh`) puts a `dsh` launcher on PATH
  // that points at lib/bin.js; resolve it so the file can be run with node directly.
  let onPath = null;
  try { const launcher = await findCommand(['dsh']); onPath = launcher && await realpath(launcher); } catch {}
  const roots = [process.env.DSH_CLI, DSH_BIN, onPath,
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    '/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    path.join(os.homedir(), 'Documents', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js'),
    path.join(process.cwd(), 'node_modules', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')];
  const found = await firstExistingPath(roots);
  if (!found) throw new Error('找不到 DeepSeek Harness CLI。请在行动配置中确认已安装，或设置 DSH_CLI 到 bin.js 的完整路径。');
  return found;
}

function validateEndpoint(value) {
  if(PUBLIC_WEB)return validatePublicEndpoint(value);
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('仅允许 HTTP(S) 模型接口');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('非本机接口必须使用 HTTPS');
  return url;
}

function eventText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(eventText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const picked = value.text || value.summary || value.content || value.output || value.aggregated_output || value.command || value.cmd || value.path || value.file || '';
    return typeof picked === 'string' ? picked : eventText(picked);
  }
  return String(value);
}

// One-line description of a Claude tool call: the command or target it was given.
function toolUseText(block) {
  const input = block?.input || {};
  return eventText(input.command || input.file_path || input.path || input.pattern || input.url || input.query) || block?.name || '工具调用';
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
      } else if (event.type === 'assistant' && event.message?.content?.some?.((block) => block?.type === 'tool_use')) {
        for (const block of event.message.content) {
          if (block?.type === 'tool_use') hooks.onEvent?.('command', toolUseText(block));
          else { const text = eventText(block); if (text) hooks.onEvent?.('message', text); }
        }
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

// DeepSeek Harness runs through its one-shot `headless` profile. API-key routes
// read DEEPSEEK_API_KEY from the launch environment, `<workspace>/.env` or
// `~/.dsh/.env`; Wendaflow never handles the key itself.
function harnessFailureMessage(text) {
  if (/MISSING_CREDENTIAL|no API key/i.test(text)) return '未找到 DeepSeek API 密钥。请在 ~/.dsh/.env 中写入一行 DEEPSEEK_API_KEY=你的密钥（或在启动后端的环境里设置它），然后重试。';
  return String(text || '').replace(/^dsh:\s*/, '').trim() || 'DeepSeek Harness 执行失败';
}

function harnessToolInput(input) {
  if (input && typeof input === 'object') {
    const direct = input.command || input.cmd || input.file_path || input.path || input.pattern || input.url || input.query;
    return direct ? String(direct) : (Object.keys(input).length ? JSON.stringify(input) : '');
  }
  return input ? String(input) : '';
}

async function runHarnessHeadless(prompt, images = [], files = [], workspace = process.cwd(), hooks = {}, options = {}) {
  const resolvedWorkspace = path.resolve(workspace || process.cwd());
  if (!(await stat(resolvedWorkspace)).isDirectory()) throw new Error('行动工作目录不是有效文件夹');
  const harnessBin = await resolveHarnessBin();
  const attachmentSet = await materializeAttachments([...images, ...files], resolvedWorkspace);
  const attachmentNotice = attachmentSet.paths.length
    ? `\n\nWendaflow 已将附件保存到以下路径。请实际打开并读取它们：\n${attachmentSet.paths.map((item) => `- ${item.name}: ${item.path}`).join('\n')}`
    : '';
  // Reasoning level is a model setting, so it travels as a temporary profile overlay.
  const effort = options.thinking === false || options.reasoning === 'none' ? 'off' : ['low', 'max'].includes(options.reasoning) ? options.reasoning : 'high';
  const patchDir = await mkdtemp(path.join(os.tmpdir(), 'wendaflow-dsh-'));
  const patchFile = path.join(patchDir, 'model.yml');
  await writeFile(patchFile, `- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: ${effort}\n`);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [harnessBin, '--profile', 'headless', '--patch', patchFile, '--json', '-'], { cwd: resolvedWorkspace, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
      hooks.onChild?.(child);
      let buffer = '', stderr = '', sessionId = '', finalText = '', failure = '';
      const timer = setTimeout(() => { failure ||= 'DeepSeek Harness 任务超时（15 分钟）'; child.kill('SIGTERM'); }, 15 * 60_000);
      const handle = (line) => {
        let event;
        try { event = JSON.parse(line); } catch { if (line.trim()) hooks.onEvent?.('terminal', line); return; }
        if (event.type === 'session') sessionId = event.sessionId || sessionId;
        else if (event.type === 'thinking') { if (event.text) hooks.onEvent?.('thinking', event.text); }
        else if (event.type === 'text') { if (event.text) hooks.onEvent?.('message', event.text); }
        else if (event.type === 'tool_call') { const input = harnessToolInput(event.input); hooks.onEvent?.('command', `${event.tool || '工具'}${input ? `\n${input}` : ''}`); }
        else if (event.type === 'tool_result') hooks.onEvent?.('command', event.result ? `${event.status === 'error' ? '失败：' : ''}${event.result}` : '工具已返回结果');
        else if (event.type === 'final') finalText = event.text || '';
        else if (event.type === 'error') failure ||= event.error?.message || event.message || 'DeepSeek Harness 出错';
        else if (event.type === 'status' && event.phase === 'turn_end' && event.reason?.kind === 'error') failure ||= event.reason.error?.message || '任务失败';
      };
      child.stdout.on('data', (chunk) => { buffer += chunk; const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''; lines.forEach(handle); });
      child.stderr.on('data', (chunk) => { const text = chunk.toString(); hooks.onEvent?.('stderr', text); stderr = (stderr + text).slice(-2000); });
      child.on('error', (error) => { clearTimeout(timer); reject(new Error(`DeepSeek Harness 无法启动：${error.message}`)); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (buffer.trim()) handle(buffer);
        if (code === 0 && !failure) resolve({ output: finalText || 'DeepSeek Harness 已完成任务。', terminal: `DeepSeek Harness session: ${sessionId}` });
        else reject(new Error(harnessFailureMessage(failure || stderr || `退出码 ${code}`)));
      });
      child.stdin.end(`${prompt}${attachmentNotice}`);
    });
  } finally {
    await rm(patchDir, { recursive: true, force: true }).catch(() => {});
    if (attachmentSet.tempDir) await rm(attachmentSet.tempDir, { recursive: true, force: true }).catch(() => {});
  }
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
  // DeepSeek Harness has its own one-shot runner (`dsh headless --json`).
  if (runner === 'deepseek') return runHarnessHeadless(prompt, images, files, resolvedWorkspace, hooks, options);
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
  const runStart = new Date(startedAt || 0).getTime() - 2_000;
  for (const [filePath, state] of candidates) {
    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      // A file merely named in the answer is not an output unless it was written during this run.
      if (state === '生成文件' && info.mtimeMs < runStart) continue;
      const type = artifactMime(filePath);
      artifacts.push({ path: filePath, name: path.basename(filePath), size: info.size, type, image: type.startsWith('image/'), state });
    } catch {}
  }
  return artifacts.slice(0, 24);
}

function publicJob(job) {
  return { id: job.id, runner: job.runner, status: job.status, startedAt: job.startedAt, completedAt: job.completedAt, events: job.events.slice(-240), terminal: job.terminal || '', output: job.output, error: job.error, before: job.before, after: job.after, artifacts: (job.artifacts || []).map((item, index) => ({ id: `${job.id}-${index}`, name: item.name, size: item.size, type: item.type, image: item.image, state: item.state, localPath: item.path, url: `http://${HOST}:${PORT}/agent/artifact?job=${encodeURIComponent(job.id)}&index=${index}` })) };
}

const personalCloud=process.env.WENDAFLOW_CLOUD_DIR?cloudApi({root:process.env.WENDAFLOW_CLOUD_DIR,origin:process.env.WENDAFLOW_PUBLIC_ORIGIN,secure:process.env.WENDAFLOW_CLOUD_INSECURE!=='1'}):null;
const server = http.createServer(async (req, res) => {
  if(personalCloud && await personalCloud.handle(req,res))return;
  if(PUBLIC_WEB){
    if(req.headers.origin && req.headers.origin !== process.env.WENDAFLOW_PUBLIC_ORIGIN){reply(res,403,{error:'Origin not allowed'});return;}
    if(!publicRequestAllowed(req.method,req.url)){reply(res,403,{error:'此功能仅限本机版本；公开版不提供服务器文件或命令执行。'});return;}
    if(req.method==='POST' && !String(req.headers['content-type']||'').startsWith('application/json')){reply(res,415,{error:'JSON required'});return;}
  }
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
          canvases.push({ id: item.canvas?.id || file.slice(0, -4), name: item.canvas?.name || '未命名画布', createdAt: item.canvas?.createdAt, updatedAt: item.canvas?.updatedAt, nodeCount: item.nodes?.length || 0, restoredAt:item.canvas?.restoredAt,restoredFrom:item.canvas?.restoredFrom });
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
      await canvasFiles.save(payload);
      // Preserve legacy split assets referenced by historical versions.
      reply(res, 200, { ok: true });
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'POST' && req.url === '/canvases/delete') {
    try {
      const { id } = await readJson(req);
      if (!/^[a-zA-Z0-9_-]+$/.test(id || '')) throw new Error('画布 ID 无效');
      const token = await canvasFiles.trash(id,payload=>hydrateCanvasAttachments(payload,id));
      reply(res, 200, { ok: true, token });
    } catch (error) { reply(res, 400, { error: error.message }); }
    return;
  }
  if (req.method === 'GET' && req.url === '/canvases/trash') {
    try { reply(res,200,{canvases:await canvasFiles.listTrash()}); } catch(error) { reply(res,500,{error:error.message}); } return;
  }
  if (req.method === 'POST' && req.url === '/canvases/restore') {
    try { const {token}=await readJson(req);reply(res,200,{canvas:await canvasFiles.restore(token)}); } catch(error) {reply(res,400,{error:error.message});} return;
  }
  if (req.method === 'POST' && req.url === '/pick-directory') {
    if (!['win32', 'darwin'].includes(process.platform)) {
      // Linux has no built-in dialog: use zenity or kdialog when installed.
      const title = '选择 Wendaflow 行动工作目录';
      const pickers = [['zenity', ['--file-selection', '--directory', `--title=${title}`]], ['kdialog', ['--getexistingdirectory', os.homedir(), '--title', title]]];
      for (const [command, args] of pickers) {
        const outcome = await new Promise((resolve) => {
          const child = spawn(command, args, { shell: false });
          let output = '';
          child.stdout.on('data', (chunk) => { output += chunk; });
          child.on('error', () => resolve(null));
          child.on('close', (code) => resolve(code === 0 ? output.trim() : ''));
        });
        if (outcome !== null) { reply(res, 200, { path: outcome }); return; }
      }
      reply(res, 400, { error: '系统里没有 zenity 或 kdialog，无法弹出选择窗口。请在下方直接输入文件夹路径。' });
      return;
    }
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
  if (req.method === 'POST' && req.url === '/resolve-directory') {
    try {
      const { path: typed = '' } = await readJson(req);
      const raw = String(typed).trim();
      if (!raw) throw new Error('请输入文件夹路径');
      const expanded = raw === '~' ? os.homedir() : raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
      if (!path.isAbsolute(expanded)) throw new Error('请输入完整路径，例如 /home/你/项目');
      const resolved = path.resolve(expanded);
      let info;
      try { info = await stat(resolved); } catch { throw new Error('找不到这个文件夹'); }
      if (!info.isDirectory()) throw new Error('这不是一个文件夹');
      reply(res, 200, { path: resolved });
    } catch (error) { reply(res, 400, { error: error.message }); }
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
    if(PUBLIC_WEB && (typeof apiKey !== 'string' || !apiKey.trim()))throw new Error('请填写你自己的模型 API 密钥。');
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
    const upstream = await fetch(target, { method: 'POST', headers, body: JSON.stringify(body), ...(PUBLIC_WEB ? {redirect:'error', signal:AbortSignal.timeout(180000)} : {}) });
    res.writeHead(upstream.status, { ...allowedHeaders, 'Content-Type': upstream.headers.get('content-type') || 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (!upstream.body) { res.end(); return; }
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (error) { reply(res, 400, { error: error.message }); }
});

server.listen(PORT, HOST, () => console.log(`Wendaflow local proxy: http://${HOST}:${PORT}`));
