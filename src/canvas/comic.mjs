// AI comic studio: one sentence of plot → a streamed storyboard of panel cards →
// one ComfyUI text-to-image job per panel → a single long comic image.
// Pure functions only (no DOM, no fetch) so the whole pipeline is testable.
import { scanObjects } from './ai-diagram.mjs';

export const MIN_PANELS = 4, MAX_PANELS = 8;
const COLS = 4, X_GAP = 380, Y_GAP = 500;

export function storyboardPrompt(request, panels = 6) {
  const count = Math.max(MIN_PANELS, Math.min(MAX_PANELS, Number(panels) || 6));
  return [
    '你是漫剧分镜师。把用户给的一句剧情扩写成一组连续的漫画分镜。',
    '只返回一个 JSON 对象，不要解释，不要 Markdown 代码围栏。按下面的字段顺序输出，画布会边收边画：',
    '{"title":"作品标题","characters":"主要角色的外观设定，英文，逗号分隔（发型、服装、年龄等），每张图都会带上它以保持角色一致","panels":[{"id":"p1","title":"分镜标题（不超过 12 字）","scene":"画面描述：景别、人物动作、表情、环境","line":"这一格的台词或旁白（不超过 30 字）","prompt":"English prompt for a text-to-image model describing only this panel: shot type, action, setting, lighting"}]}',
    '规则：',
    `- 正好 ${count} 格（${MIN_PANELS}–${MAX_PANELS} 之间），有起承转合，最后一格要有结尾或反转。`,
    '- title、scene、line 使用与用户剧情相同的语言；characters 和 prompt 必须是英文。',
    '- prompt 不要写画风（画风由用户统一设置），不要写文字、对话框或字幕。',
    `用户剧情：${request}`,
  ].join('\n');
}

function stringField(text, key) {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
  if (!match) return '';
  try { return JSON.parse(`"${match[1]}"`); } catch { return ''; }
}

// With partial=true an unfinished reply yields whatever has fully arrived (or null) instead of throwing.
export function parseStoryboard(text, { partial = false } = {}) {
  const raw = String(text || '');
  if (!partial && raw.indexOf('{') < 0) throw new Error('模型没有返回分镜数据');
  const panels = [], ids = new Set();
  for (const item of scanObjects(raw, 'panels')) {
    const id = String(item?.id ?? `p${panels.length + 1}`).trim();
    const scene = String(item?.scene ?? '').trim();
    const title = String(item?.title ?? '').trim() || scene.slice(0, 12);
    if (!title || !scene || ids.has(id) || panels.length >= MAX_PANELS) continue;
    ids.add(id);
    panels.push({ id, title: title.slice(0, 40), scene: scene.slice(0, 400), line: String(item.line ?? '').trim().slice(0, 120), prompt: String(item.prompt ?? '').trim().slice(0, 600) });
  }
  if (!panels.length) { if (partial) return null; throw new Error('模型没有画出任何分镜'); }
  return { title: stringField(raw, 'title').slice(0, 60), characters: stringField(raw, 'characters').slice(0, 400), panels };
}

export function panelContent(panel, labels = {}) {
  const scene = labels.scene || '画面', line = labels.line || '台词';
  return [`**${scene}**：${panel.scene}`, panel.line ? `**${line}**：「${panel.line}」` : ''].filter(Boolean).join('\n\n');
}

// Stable per-series seed so every panel of one comic starts from related noise.
export function seriesSeed(seriesId, index = 0) {
  let h = 2166136261;
  for (const ch of String(seriesId)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return (h + index * 7919) % 2147483647;
}

// Returns the next node list: a story card followed by panel cards chained in reading order.
export function applyStoryboard(existing, board, { request = '', origin = { x: 0, y: 0 }, stamp = Date.now(), labels = {} } = {}) {
  const seriesId = `comic-${stamp}`;
  const storyId = `${seriesId}-story`;
  const story = {
    id: storyId, type: 'thought', author: 'AI', model: null, title: board.title || request.slice(0, 30) || labels.story || '漫剧',
    content: request, prompt: null, parentId: null, x: origin.x, y: origin.y, status: 'done', attachments: [],
    comic: { seriesId, role: 'story', request, characters: board.characters || '' },
  };
  const panels = board.panels.map((panel, index) => {
    const col = index % COLS, row = Math.floor(index / COLS);
    return {
      id: `${seriesId}-${index}`, type: 'thought', author: 'AI', model: null, title: `${index + 1}. ${panel.title}`,
      content: panelContent(panel, labels), prompt: null, parentId: index ? `${seriesId}-${index - 1}` : storyId,
      x: origin.x + X_GAP * (col + 1), y: origin.y + row * Y_GAP, status: 'done', attachments: [], manualWidth: 340,
      comic: { seriesId, role: 'panel', index, scene: panel.scene, line: panel.line, imagePrompt: panel.prompt },
    };
  });
  const created = [story, ...panels];
  return { nodes: [...existing, ...created], createdIds: created.map((n) => n.id), seriesId };
}

export function seriesPanels(nodes, seriesId) {
  return nodes.filter((n) => n.comic?.seriesId === seriesId && n.comic.role === 'panel').sort((a, b) => a.comic.index - b.comic.index);
}

export function panelImage(node) {
  const list = (node.attachments || []).filter((item) => item.dataUrl?.startsWith('data:image/'));
  return list.find((item) => item.comfy) || list.at(-1) || null;
}

// ---- ComfyUI workflow templates (API format) ----

export const COMIC_TEMPLATES = {
  // Qwen-Image family (e.g. NoctQ V4): separate diffusion model, text encoder and VAE; understands Chinese prompts.
  noctq: { checkpoint: 'NoctQ_V4_int8_convrot.safetensors', clip: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors', steps: 25, cfg: 3, sampler: 'euler', scheduler: 'simple' },
  sdxl: { checkpoint: 'sd_xl_base_1.0.safetensors', steps: 25, cfg: 7, sampler: 'euler', scheduler: 'normal' },
  flux: { checkpoint: 'flux1-schnell-fp8.safetensors', steps: 4, cfg: 1, sampler: 'euler', scheduler: 'simple' },
};

export const DEFAULT_COMIC_SETTINGS = {
  endpoint: 'http://127.0.0.1:8188', template: 'noctq', checkpoint: COMIC_TEMPLATES.noctq.checkpoint,
  clip: COMIC_TEMPLATES.noctq.clip, vae: COMIC_TEMPLATES.noctq.vae,
  style: 'manga comic panel, clean line art, cel shading, vibrant colors, expressive faces',
  negative: 'lowres, blurry, text, speech bubble, watermark, signature, logo, brand name, deformed hands, extra fingers',
  width: 1216, height: 832, steps: 25, cfg: 3, panels: 6, customWorkflow: '',
};

export function normalizeComicSettings(value) {
  const s = { ...DEFAULT_COMIC_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  return {
    ...s, endpoint: String(s.endpoint || DEFAULT_COMIC_SETTINGS.endpoint).trim().replace(/\/+$/, ''),
    template: ['noctq', 'sdxl', 'flux', 'custom'].includes(s.template) ? s.template : 'noctq',
    width: Math.round(num(s.width, 256, 2048, 1216) / 8) * 8, height: Math.round(num(s.height, 256, 2048, 832) / 8) * 8,
    steps: Math.round(num(s.steps, 1, 150, 25)), cfg: num(s.cfg, 0, 30, 3), panels: Math.round(num(s.panels, MIN_PANELS, MAX_PANELS, 6)),
  };
}

export function panelImagePrompt(settings, characters, panel) {
  return [settings.style, characters, panel.imagePrompt || panel.scene].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
}

function fillPlaceholders(value, vars) {
  if (typeof value === 'string') {
    const whole = /^\{\{(\w+)\}\}$/.exec(value);
    if (whole && whole[1] in vars) return vars[whole[1]];
    return value.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
  }
  if (Array.isArray(value)) return value.map((v) => fillPlaceholders(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillPlaceholders(v, vars)]));
  return value;
}

export function buildComfyWorkflow(rawSettings, { prompt, seed = 0 }) {
  const s = normalizeComicSettings(rawSettings);
  const vars = { prompt, negative: s.negative, seed, checkpoint: s.checkpoint, clip: s.clip, vae: s.vae, width: s.width, height: s.height, steps: s.steps, cfg: s.cfg };
  if (s.template === 'custom') {
    let parsed;
    try { parsed = JSON.parse(s.customWorkflow || ''); } catch { throw new Error('自定义工作流不是有效的 JSON（请在 ComfyUI 里用 “Export (API)” 导出）'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('自定义工作流不是有效的 JSON（请在 ComfyUI 里用 “Export (API)” 导出）');
    if (!JSON.stringify(parsed).includes('{{prompt}}')) throw new Error('自定义工作流里缺少 {{prompt}} 占位符');
    return fillPlaceholders(parsed.prompt && typeof parsed.prompt === 'object' ? parsed.prompt : parsed, vars);
  }
  const t = COMIC_TEMPLATES[s.template];
  if (s.template === 'noctq') {
    return {
      1: { class_type: 'UNETLoader', inputs: { unet_name: s.checkpoint || t.checkpoint, weight_dtype: 'default' } },
      2: { class_type: 'CLIPLoader', inputs: { clip_name: s.clip || t.clip, type: 'qwen_image', device: 'default' } },
      3: { class_type: 'VAELoader', inputs: { vae_name: s.vae || t.vae } },
      4: { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['2', 0], prompt, negative_prompt: s.negative, resolution: 1024 } },
      5: { class_type: 'EmptyLatentImage', inputs: { width: s.width, height: s.height, batch_size: 1 } },
      6: { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['4', 1], latent_image: ['5', 0], seed, steps: s.steps, cfg: s.cfg, sampler_name: t.sampler, scheduler: t.scheduler, denoise: 1 } },
      7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['3', 0] } },
      8: { class_type: 'SaveImage', inputs: { images: ['7', 0], filename_prefix: 'Wendaflow_comic' } },
    };
  }
  const flux = s.template === 'flux';
  return {
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: s.checkpoint || t.checkpoint } },
    5: { class_type: flux ? 'EmptySD3LatentImage' : 'EmptyLatentImage', inputs: { width: s.width, height: s.height, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: flux ? '' : s.negative, clip: ['4', 1] } },
    ...(flux ? { 10: { class_type: 'FluxGuidance', inputs: { guidance: 3.5, conditioning: ['6', 0] } } } : {}),
    3: { class_type: 'KSampler', inputs: { seed, steps: s.steps, cfg: s.cfg, sampler_name: t.sampler, scheduler: t.scheduler, denoise: 1, model: ['4', 0], positive: [flux ? '10' : '6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: 'Wendaflow_comic', images: ['8', 0] } },
  };
}

// ComfyUI /history/{id} → finished images, an error, or still running.
export function readComfyHistory(history, promptId) {
  const entry = history?.[promptId];
  if (!entry) return { done: false };
  const status = entry.status || {};
  if (status.status_str === 'error') {
    const message = (status.messages || []).find(([kind]) => kind === 'execution_error')?.[1];
    return { done: true, error: message?.exception_message ? `${message.node_type || 'ComfyUI'}: ${String(message.exception_message).trim()}` : 'ComfyUI 执行出错' };
  }
  const images = Object.values(entry.outputs || {}).flatMap((out) => out?.images || []).filter((img) => img?.filename && img.type !== 'temp');
  const all = images.length ? images : Object.values(entry.outputs || {}).flatMap((out) => out?.images || []);
  if (!all.length) return status.completed === false ? { done: false } : { done: true, error: '工作流没有输出图片（需要一个 SaveImage 节点）' };
  return { done: true, images: all.map(({ filename, subfolder = '', type = 'output' }) => ({ filename, subfolder, type })) };
}
