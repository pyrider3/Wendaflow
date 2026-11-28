// AI comic studio plugin (AI 漫剧工作台): one line of plot → storyboard cards →
// one local ComfyUI image per card → a long comic image. Everything the main app
// needs from it comes back from this hook; with the plugin off it adds nothing.
import React, { useEffect, useRef, useState } from 'react';
import { LOCAL_PROXY_URL, PUBLIC_WEB } from '../../localProxy.js';
import { contextMessages, streamCloud, streamOllama } from '../../modelGateway';
import { resolveModelProfile } from '../../components/modelProfiles.mjs';
import { Page, Group, Fields, Field, Input, Select, Button, Status } from '../../components/settings/ui.jsx';
import { syncPluginsToServer } from '../registry.js';
import { storyboardPrompt, parseStoryboard, applyStoryboard, seriesPanels, panelImage, seriesSeed, normalizeComicSettings, buildComfyWorkflow, panelImagePrompt, COMIC_TEMPLATES } from './comic.mjs';
import './comic.css';

export const COMIC_MODE = 'comic';

// `app` carries the canvas state and helpers the plugin works with; it is read fresh on every render.
export function useComicPlugin(app) {
  const { enabled, nodeType, setNodeType, quickThought, draft, setDraft, drawBusy, setDrawBusy, drawAbortRef, model, cloudProfiles, localProfiles, ollama,
    normalizeChatOptions, notify, tr, say, nodes, nodeSizes, canvasRef, viewportRef, fitViewRef, beginHistory, endHistory, setNodes, setSelectedIds, setSelectedId,
    setNewNodeId, branchingFrom, closeBranch, currentNodes, activeCanvasIdRef, updateTaskNode, saveExport, setStorageWarning } = app;
  // AI comic studio: ComfyUI settings live in this browser; jobs are tracked per card.
  const [comicSettings, setComicSettings] = useState(() => { try { return normalizeComicSettings(JSON.parse(localStorage.getItem('wendaflow-comic-v1') || 'null')); } catch { return normalizeComicSettings(null); } });
  useEffect(() => { try { localStorage.setItem('wendaflow-comic-v1', JSON.stringify(comicSettings)); } catch { /* storage blocked */ } }, [comicSettings]);
  const [comfyState, setComfyState] = useState({ tone: 'idle', text: '', checkpoints: [], unets: [], clips: [], vaes: [] });
  const comicJobsRef = useRef(new Set());

  // Turning the plugin off while the composer is in comic mode falls back to chat.
  useEffect(() => { if (!enabled && nodeType === COMIC_MODE) setNodeType('conversation'); }, [enabled, nodeType]);
  const active = enabled && !quickThought && nodeType === COMIC_MODE;

  // AI comic studio, step 1: one line of plot → streamed storyboard cards (same live drawing as AI drawing).
  async function storyboardWithAI() {
    const request = draft.trim();
    if (drawBusy) { drawAbortRef.current?.abort(); return; }
    if (!request) return;
    const { cloud: profile, local: localProfile } = resolveModelProfile(model, cloudProfiles, localProfiles);
    if (!profile && !localProfile) { notify(tr('请先在设置 → 模型连接中添加并选择一个模型','Add and select a model in Settings → Model connections first')); return; }
    if (profile && !profile.apiKey) { notify(tr(`尚未填写 ${profile.name} 的 API 密钥`,`Missing API key for ${profile.name}`)); return; }
    setDrawBusy(true);
    const controller = new AbortController(); drawAbortRef.current = controller;
    notify(tr('AI 正在拆分镜……','AI is writing the storyboard…'));
    try {
      const settings = normalizeComicSettings(comicSettings);
      const messages = contextMessages([], null, storyboardPrompt(request, settings.panels), [], []);
      const chatOptions = normalizeChatOptions(profile?.chatOptions || localProfile?.chatOptions || {});
      const maxX = nodes.length ? Math.max(...nodes.map((node) => node.x + (nodeSizes.get(node.id)?.width || 224))) : 0;
      const rect = canvasRef.current?.getBoundingClientRect();
      const view = viewportRef.current;
      const origin = nodes.length ? { x: maxX + 160, y: Math.min(...nodes.map((node) => node.y)) } : { x: rect ? (120 - view.x) / view.zoom : 120, y: rect ? (110 - view.y) / view.zoom : 110 };
      const baseNodes = nodes, stamp = Date.now();
      const labels = { scene: tr('画面','Scene'), line: tr('台词','Line'), story: tr('漫剧','Comic') };
      let buffer = '', shown = 0, fitTimer = 0, drawTimer = 0;
      beginHistory();
      const show = (text, final) => {
        const board = parseStoryboard(text, { partial: true });
        if (!board || (!final && board.panels.length === shown)) return null;
        shown = board.panels.length;
        const result = applyStoryboard(baseNodes, board, { request, origin, stamp, labels });
        setNodes(result.nodes);
        setSelectedIds(new Set(result.createdIds)); setSelectedId(result.createdIds[0] || null);
        setNewNodeId(result.createdIds.at(-1) || null);
        window.clearTimeout(fitTimer); fitTimer = window.setTimeout(() => { setNewNodeId(null); fitViewRef.current?.(); }, 260);
        return result;
      };
      const onToken = (text) => {
        buffer = text;
        if (!drawTimer) drawTimer = window.setTimeout(() => { drawTimer = 0; show(buffer, false); }, 60);
      };
      let result = null;
      try {
        const answer = profile
          ? await streamCloud({ ...profile, messages, chatOptions, signal: controller.signal, onToken })
          : await streamOllama({ endpoint: localProfile.endpoint, model: localProfile.model, messages, chatOptions, signal: controller.signal, onToken });
        window.clearTimeout(drawTimer); drawTimer = 0;
        result = show(answer || buffer, true);
        if (!result) parseStoryboard(answer || buffer);
      } finally { window.clearTimeout(drawTimer); endHistory(); }
      if (!result) throw new Error(tr('模型没有画出任何分镜','The model wrote no panels'));
      setDraft('');
      if (branchingFrom) closeBranch();
      notify(tr(`已拆成 ${result.createdIds.length - 1} 个分镜。点分镜卡上的“生成画面”，或在故事卡上点“逐张出图”。`,`Split into ${result.createdIds.length - 1} panels. Click “Generate image” on a panel, or “Draw all panels” on the story card.`));
    } catch (error) {
      if (error?.name === 'AbortError') notify(tr('已停止拆分镜，已生成的分镜保留。','Storyboard stopped; panels written so far are kept.'));
      else notify(tr(`拆分镜失败：${error.message}`,`Storyboard failed: ${error.message}`));
    } finally { setDrawBusy(false); drawAbortRef.current = null; }
  }

  // All ComfyUI traffic goes through server.mjs, which turns failures into readable sentences.
  async function comfyCall(path, body, retried = false) {
    if (PUBLIC_WEB) throw new Error(tr('公开版不能连接本机 ComfyUI，请使用本机版本。','The public web version cannot reach a local ComfyUI. Use the local version.'));
    let response;
    try { response = await fetch(`${LOCAL_PROXY_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { throw new Error(tr('无法连接本机服务（server.mjs，端口 4318）。请用 npm run app 启动，或另开终端运行 npm run proxy。','Cannot reach the local service (server.mjs, port 4318). Start with npm run app, or run npm run proxy in another terminal.')); }
    const result = await response.json().catch(() => ({}));
    // server.mjs restarted since the switch was synced: tell it again and retry once.
    if (response.status === 403 && result?.code === 'plugin_disabled' && !retried && enabled && await syncPluginsToServer({ comic: true })) return comfyCall(path, body, true);
    if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);
    return result;
  }

  async function testComfy() {
    setComfyState((current) => ({ ...current, tone: 'idle', text: tr('正在连接 ComfyUI…','Connecting to ComfyUI…') }));
    try {
      const status = await comfyCall('/comfy/status', { endpoint: comicSettings.endpoint });
      const found = (comicSettings.template === 'noctq' ? status.unets : status.checkpoints)?.length || 0;
      setComfyState({ tone: 'ok', checkpoints: status.checkpoints || [], unets: status.unets || [], clips: status.clips || [], vaes: status.vaes || [], text: tr(`已连接 ComfyUI ${status.version || ''} · ${status.device || ''} · ${found} 个模型文件`,`Connected to ComfyUI ${status.version || ''} · ${status.device || ''} · ${found} checkpoints`) });
      return { status };
    } catch (error) { setComfyState((current) => ({ ...current, tone: 'error', text: error.message })); return { error: error.message }; }
  }

  // AI comic studio, step 2: one panel card → one ComfyUI text-to-image job → an image attachment on that card.
  async function generateComicPanel(target, { quiet = false } = {}) {
    const list = typeof currentNodes === 'function' ? currentNodes() : nodes;
    const node = list.find((item) => item.id === (target?.id || target));
    if (!node?.comic || node.comic.role !== 'panel') return false;
    if (drawBusy) { notify(tr('分镜还在生成，完成后再出图。','The storyboard is still being written; generate images when it finishes.')); return false; }
    if (comicJobsRef.current.has(node.id)) return false;
    const canvasId = activeCanvasIdRef.current;
    const story = list.find((item) => item.comic?.seriesId === node.comic.seriesId && item.comic.role === 'story');
    const settings = normalizeComicSettings(comicSettings);
    const seed = panelImage(node) ? Math.floor(Math.random() * 2147483647) : seriesSeed(node.comic.seriesId, node.comic.index);
    const patch = (fields, extra = {}) => updateTaskNode(canvasId, node.id, (item) => ({ ...item, ...extra, comic: { ...(item.comic || {}), ...fields } }));
    comicJobsRef.current.add(node.id);
    patch({ status: 'running', phase: tr('正在提交到 ComfyUI…','Sending to ComfyUI…'), error: '' });
    try {
      const workflow = buildComfyWorkflow(settings, { prompt: panelImagePrompt(settings, story?.comic?.characters, node.comic), seed });
      const { promptId } = await comfyCall('/comfy/prompt', { endpoint: settings.endpoint, workflow });
      const started = Date.now();
      let state = { done: false };
      while (!state.done) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        state = await comfyCall('/comfy/progress', { endpoint: settings.endpoint, promptId });
        const seconds = Math.round((Date.now() - started) / 1000);
        if (!state.done && seconds > 900) throw new Error(tr('ComfyUI 超过 15 分钟没有完成，已停止等待。','ComfyUI did not finish within 15 minutes; stopped waiting.'));
        if (!state.done) patch({ phase: state.position ? tr(`ComfyUI 排队中，前面还有 ${state.position} 个任务…`,`Queued in ComfyUI, ${state.position} jobs ahead…`) : tr(`ComfyUI 正在出图… ${seconds} 秒`,`ComfyUI is drawing… ${seconds}s`) });
      }
      if (state.error) throw new Error(state.error);
      patch({ phase: tr('正在取回图片…','Fetching image…') });
      const image = await comfyCall('/comfy/image', { endpoint: settings.endpoint, ...state.images[0] });
      const attachment = { id: `attachment-comfy-${Date.now()}-${node.comic.index}`, name: `panel-${node.comic.index + 1}.${(image.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, type: image.type, size: image.size, dataUrl: image.dataUrl, comfy: { promptId, seed, filename: image.name } };
      updateTaskNode(canvasId, node.id, (item) => ({ ...item, attachments: [...(item.attachments || []).filter((entry) => !entry.comfy), attachment], comic: { ...(item.comic || {}), status: 'done', phase: '', error: '', seed } }));
      return true;
    } catch (error) {
      patch({ status: 'error', phase: '', error: error.message });
      if (!quiet) notify(tr(`出图失败：${error.message}`,`Image generation failed: ${error.message}`));
      return false;
    } finally { comicJobsRef.current.delete(node.id); }
  }

  async function generateComicSeries(target) {
    const list = typeof currentNodes === 'function' ? currentNodes() : nodes;
    const panels = seriesPanels(list, target?.comic?.seriesId);
    if (!panels.length) return;
    const todo = panels.filter((panel) => !panelImage(panel));
    if (!todo.length) { notify(tr('这组分镜都已出图；要换图请点单张卡片上的“重新出图”。','All panels already have images. Use “Redraw” on a panel to replace one.')); return; }
    const probe = await testComfy();
    if (probe.error) { notify(tr(`ComfyUI 不可用：${probe.error}`,`ComfyUI unavailable: ${probe.error}`)); return; }
    notify(tr(`开始逐张出图，共 ${todo.length} 张。`,`Drawing ${todo.length} panels one by one.`));
    let done = 0;
    for (const panel of todo) {
      if (!await generateComicPanel(panel, { quiet: true })) { notify(tr(`第 ${panel.comic.index + 1} 格出图失败，已停止。错误显示在该卡片上。`,`Panel ${panel.comic.index + 1} failed, so the batch stopped. The error is shown on that card.`)); return; }
      done += 1;
    }
    notify(tr(`已完成 ${done} 张分镜画面，可在故事卡上“导出长图”。`,`Finished ${done} panel images. Use “Export long image” on the story card.`));
  }

  // AI comic studio, step 3: the panels in reading order → one long PNG.
  async function exportComicStrip(target) {
    try {
      const list = typeof currentNodes === 'function' ? currentNodes() : nodes;
      const seriesId = target?.comic?.seriesId;
      const panels = seriesPanels(list, seriesId);
      if (!panels.length) return;
      const story = list.find((item) => item.comic?.seriesId === seriesId && item.comic.role === 'story');
      const missing = panels.filter((panel) => !panelImage(panel)).length;
      const loadSize = (dataUrl) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => resolve(null); img.src = dataUrl; });
      const items = [];
      for (const panel of panels) {
        const image = panelImage(panel);
        const size = image ? await loadSize(image.dataUrl) : null;
        items.push({ title: panel.title, scene: panel.comic.scene, line: panel.comic.line, image: image && size ? { dataUrl: image.dataUrl, ...size } : null });
      }
      const { comicStripSVG } = await import('./comic-strip.mjs');
      const name = String(story?.title || 'wendaflow-comic').replace(/[\\/:*?"<>|]/g, '_');
      const { svg, width, height } = comicStripSVG(items, { title: story?.title || '' });
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        const img = new Image(); img.decoding = 'sync';
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('render')); img.src = url; });
        const scale = Math.min(1, 16000 / height);
        const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error(tr('长图太大，无法生成。','The long image is too large to render.'));
        await saveExport(blob, `${name}.png`, 'image/png');
        if (missing) notify(tr(`已导出长图；其中 ${missing} 格还没有出图，用文字占位。`,`Long image exported; ${missing} panels have no image yet and use text placeholders.`));
      } finally { URL.revokeObjectURL(url); }
    } catch (error) { setStorageWarning(say('导出失败：','Export failed: ') + error.message); }
  }

  function renderSettings() {
    if (!enabled) return null;
    const set = (patch) => setComicSettings((current) => normalizeComicSettings({ ...current, ...patch }));
    const num = (key) => (event) => set({ [key]: event.target.value });
    return (
      <Page title={tr('漫剧工作台','Comic studio')} description={tr('在输入框选择“漫剧”，一句剧情会被拆成分镜卡片；每张卡片可调用本机 ComfyUI 出图，最后导出成一张长图。','Pick “Comic” in the composer: one line of plot becomes storyboard cards, each card can be drawn by your local ComfyUI, and the set exports as one long image.')}>
        <Group title="ComfyUI" hint={tr('请求经本机服务 server.mjs 转发到这个地址，浏览器不直接访问 ComfyUI。','Requests go through the local server.mjs to this address; the browser never calls ComfyUI directly.')}>
          <Fields>
            <Field label={tr('ComfyUI 地址','ComfyUI address')} span><Input value={comicSettings.endpoint} onChange={(event) => setComicSettings((current) => ({ ...current, endpoint: event.target.value }))} onBlur={() => set({})} placeholder="http://127.0.0.1:8188" /></Field>
            <Field label={tr('工作流模板','Workflow template')}>
              <Select value={comicSettings.template} onChange={(event) => { const template = event.target.value; const preset = COMIC_TEMPLATES[template]; set(preset ? { template, checkpoint: preset.checkpoint, steps: preset.steps, cfg: preset.cfg, ...(preset.clip ? { clip: preset.clip, vae: preset.vae } : {}) } : { template }); }}>
                <option value="noctq">NoctQ / Qwen Image</option>
                <option value="sdxl">SDXL</option>
                <option value="flux">Flux</option>
                <option value="custom">{tr('自定义工作流（API 格式）','Custom workflow (API format)')}</option>
              </Select>
            </Field>
            <Field label={tr('模型文件（checkpoint）','Checkpoint file')}><Input list="comfy-checkpoints" value={comicSettings.checkpoint} onChange={(event) => set({ checkpoint: event.target.value })} /><datalist id="comfy-checkpoints">{(comicSettings.template === 'noctq' ? comfyState.unets : comfyState.checkpoints).map((name) => <option key={name} value={name} />)}</datalist></Field>
            {comicSettings.template === 'noctq' && <Field label={tr('文本编码器','Text encoder')}><Input list="comfy-clips" value={comicSettings.clip} onChange={(event) => set({ clip: event.target.value })} /><datalist id="comfy-clips">{comfyState.clips.map((name) => <option key={name} value={name} />)}</datalist></Field>}
            {comicSettings.template === 'noctq' && <Field label="VAE"><Input list="comfy-vaes" value={comicSettings.vae} onChange={(event) => set({ vae: event.target.value })} /><datalist id="comfy-vaes">{comfyState.vaes.map((name) => <option key={name} value={name} />)}</datalist></Field>}
            <Field label={tr('统一画风提示词','Shared style prompt')} span><Input value={comicSettings.style} onChange={(event) => set({ style: event.target.value })} /></Field>
            <Field label={tr('反向提示词','Negative prompt')} span><Input value={comicSettings.negative} onChange={(event) => set({ negative: event.target.value })} /></Field>
            <Field label={tr('宽 × 高','Width × height')}><div className="comic-size"><Input type="number" step="64" value={comicSettings.width} onChange={(event) => setComicSettings((current) => ({ ...current, width: event.target.value }))} onBlur={() => set({})} /><Input type="number" step="64" value={comicSettings.height} onChange={(event) => setComicSettings((current) => ({ ...current, height: event.target.value }))} onBlur={() => set({})} /></div></Field>
            <Field label={tr('步数 · CFG','Steps · CFG')}><div className="comic-size"><Input type="number" value={comicSettings.steps} onChange={num('steps')} /><Input type="number" step="0.5" value={comicSettings.cfg} onChange={num('cfg')} /></div></Field>
            <Field label={tr('分镜数量','Panel count')}><Input type="number" min="4" max="8" value={comicSettings.panels} onChange={num('panels')} /></Field>
            {comicSettings.template === 'custom' && <Field label={tr('工作流 JSON','Workflow JSON')} span><textarea className="sx-input comic-workflow" spellCheck={false} value={comicSettings.customWorkflow} onChange={(event) => set({ customWorkflow: event.target.value })} placeholder={'{"3":{"class_type":"KSampler","inputs":{"seed":"{{seed}}"}},"6":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}"}}}'} /></Field>}
          </Fields>
          {comicSettings.template === 'custom' && <p className="sx-note" style={{ padding: '0 18px' }}>{tr('在 ComfyUI 里用 “Export (API)” 导出工作流，把正向提示词改成 {{prompt}}。也可以用 {{negative}}、{{seed}}、{{checkpoint}}、{{width}}、{{height}}、{{steps}}、{{cfg}}。','Export the workflow from ComfyUI with “Export (API)” and change the positive prompt to {{prompt}}. You can also use {{negative}}, {{seed}}, {{checkpoint}}, {{width}}, {{height}}, {{steps}} and {{cfg}}.')}</p>}
          <div className="sx-actionbar">
            <Status tone={comfyState.tone === 'ok' ? 'ok' : comfyState.tone === 'error' ? 'warn' : 'idle'}>{comfyState.text || tr('尚未测试连接','Connection not tested')}</Status>
            <Button kind="primary" onClick={testComfy}>{tr('测试连接','Test connection')}</Button>
          </div>
        </Group>
      </Page>
    );
  }

  return {
    enabled,
    active,
    busy: active && drawBusy,
    composerMode: enabled ? [COMIC_MODE, tr('漫剧','Comic')] : null,
    settingsSection: enabled ? { id: COMIC_MODE, label: tr('漫剧','Comic') } : null,
    placeholder: tr('输入一句剧情，例如：一个大学生熬夜写论文，AI 帮他理清思路……','One line of plot, e.g. a student pulls an all-nighter on a thesis and AI helps sort out the ideas…'),
    submit: storyboardWithAI,
    renderSettings,
    // Stable keys for the card action table; each call is guarded so a disabled plugin does nothing.
    cardActions: {
      generateComicPanel: (...args) => (enabled ? generateComicPanel(...args) : false),
      generateComicSeries: (...args) => (enabled ? generateComicSeries(...args) : undefined),
      exportComicStrip: (...args) => (enabled ? exportComicStrip(...args) : undefined),
    },
  };
}
