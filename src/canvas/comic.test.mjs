import test from 'node:test';
import assert from 'node:assert/strict';
import { storyboardPrompt, parseStoryboard, applyStoryboard, seriesPanels, buildComfyWorkflow, readComfyHistory, normalizeComicSettings, panelImagePrompt, panelImage, seriesSeed } from './comic.mjs';
import { comicStripSVG } from './comic-strip.mjs';
import { comfyStatus, comfySubmit, comfyProgress, comfyImage, comfyBase } from './comfy-proxy.mjs';

const reply = '```json\n{"title":"论文之夜","characters":"young male student, black hoodie, messy hair","panels":[' +
  '{"id":"p1","title":"深夜","scene":"宿舍里只有台灯亮着","line":"还有三千字……","prompt":"night dorm room, desk lamp"},' +
  '{"id":"p2","title":"卡住","scene":"他抱头盯着屏幕","line":"写不下去了","prompt":"close-up, student holding head"},' +
  '{"id":"p3","title":"AI 出场","scene":"屏幕上出现思维导图","line":"先把论点拆开吧","prompt":"glowing mind map on screen"},' +
  '{"id":"p4","title":"天亮","scene":"窗外天亮，他伸懒腰","line":"写完了！","prompt":"sunrise window, stretching"}]}\n```';

test('storyboard prompt clamps the panel count and parses fenced, streamed replies', () => {
  assert.match(storyboardPrompt('熬夜写论文', 20), /正好 8 格/);
  assert.match(storyboardPrompt('熬夜写论文', 1), /正好 4 格/);
  const board = parseStoryboard(reply);
  assert.equal(board.title, '论文之夜');
  assert.equal(board.characters, 'young male student, black hoodie, messy hair');
  assert.equal(board.panels.length, 4);
  assert.equal(board.panels[2].line, '先把论点拆开吧');
  assert.equal(parseStoryboard(reply.slice(0, 120), { partial: true }), null);
  assert.equal(parseStoryboard(reply.slice(0, reply.indexOf('"p3"')), { partial: true }).panels.length, 2);
  assert.throws(() => parseStoryboard('抱歉'));
  assert.throws(() => parseStoryboard('{"panels":[]}'));
});

test('panels become chained cards in a grid next to a story card', () => {
  const existing = [{ id: 'old', type: 'thought', title: 'x', x: 0, y: 0 }];
  const { nodes, createdIds, seriesId } = applyStoryboard(existing, parseStoryboard(reply), { request: '熬夜写论文', origin: { x: 100, y: 50 }, stamp: 7, labels: { scene: 'Scene', line: 'Line' } });
  assert.equal(createdIds.length, 5);
  assert.equal(nodes[0], existing[0]);
  const panels = seriesPanels(nodes, seriesId);
  assert.deepEqual(panels.map((n) => n.comic.index), [0, 1, 2, 3]);
  assert.equal(panels[0].parentId, `${seriesId}-story`);
  assert.equal(panels[3].parentId, panels[2].id);
  assert.match(panels[0].content, /\*\*Scene\*\*：宿舍/);
  assert.match(panels[0].content, /「还有三千字……」/);
  const keys = nodes.map((n) => `${n.x},${n.y}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(nodes.find((n) => n.id === `${seriesId}-story`).comic.characters, 'young male student, black hoodie, messy hair');
});

test('built-in SDXL and Flux workflows carry checkpoint, prompt, seed and size', () => {
  const sdxl = buildComfyWorkflow({ template: 'sdxl', checkpoint: 'my.safetensors', width: 1000, height: 600 }, { prompt: 'a cat', seed: 42 });
  assert.equal(sdxl[4].inputs.ckpt_name, 'my.safetensors');
  assert.equal(sdxl[6].inputs.text, 'a cat');
  assert.equal(sdxl[3].inputs.seed, 42);
  assert.equal(sdxl[5].inputs.width, 1000); assert.equal(sdxl[5].inputs.height, 600);
  assert.equal(sdxl[9].class_type, 'SaveImage');
  const flux = buildComfyWorkflow({ template: 'flux', steps: 4, cfg: 1 }, { prompt: 'p', seed: 1 });
  assert.equal(flux[3].inputs.positive[0], '10');
  assert.equal(flux[10].class_type, 'FluxGuidance');
  assert.equal(flux[7].inputs.text, '');
  const prompt = panelImagePrompt(normalizeComicSettings({ style: 'ink style' }), 'red scarf girl', { imagePrompt: 'running in rain' });
  assert.equal(prompt, 'ink style, red scarf girl, running in rain');
  assert.equal(seriesSeed('comic-1', 2), seriesSeed('comic-1', 2));
});

test('NoctQ (Qwen Image) is the default template, with loaders and a two-output text encoder', () => {
  const wf = buildComfyWorkflow({}, { prompt: '深夜宿舍', seed: 7 });
  assert.equal(wf[1].class_type, 'UNETLoader'); assert.equal(wf[1].inputs.unet_name, 'NoctQ_V4_int8_convrot.safetensors');
  assert.equal(wf[2].inputs.type, 'qwen_image'); assert.equal(wf[3].inputs.vae_name, 'qwen_image_2.1_vae_bf16.safetensors');
  assert.equal(wf[4].inputs.prompt, '深夜宿舍'); assert.deepEqual(wf[6].inputs.negative, ['4', 1]);
  assert.equal(wf[6].inputs.seed, 7); assert.equal(wf[6].inputs.cfg, 3); assert.equal(wf[8].class_type, 'SaveImage');
});

test('custom API-format workflows get placeholders filled and typed', () => {
  const custom = JSON.stringify({ 1: { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps}}' } }, 2: { class_type: 'CLIPTextEncode', inputs: { text: 'best, {{prompt}}' } } });
  const wf = buildComfyWorkflow({ template: 'custom', customWorkflow: custom, steps: 9 }, { prompt: 'a dog', seed: 5 });
  assert.equal(wf[1].inputs.seed, 5); assert.equal(wf[1].inputs.steps, 9);
  assert.equal(wf[2].inputs.text, 'best, a dog');
  assert.throws(() => buildComfyWorkflow({ template: 'custom', customWorkflow: '{bad' }, { prompt: 'x' }), /JSON/);
  assert.throws(() => buildComfyWorkflow({ template: 'custom', customWorkflow: '{"1":{}}' }, { prompt: 'x' }), /\{\{prompt\}\}/);
});

test('ComfyUI history is read as running, error or images', () => {
  assert.deepEqual(readComfyHistory({}, 'a'), { done: false });
  assert.deepEqual(readComfyHistory({ a: { status: { status_str: 'success', completed: true }, outputs: { 9: { images: [{ filename: 'x.png', subfolder: '', type: 'output' }] } } } }, 'a').images, [{ filename: 'x.png', subfolder: '', type: 'output' }]);
  assert.match(readComfyHistory({ a: { status: { status_str: 'error', messages: [['execution_error', { node_type: 'CheckpointLoaderSimple', exception_message: 'not found' }]] }, outputs: {} } }, 'a').error, /CheckpointLoaderSimple: not found/);
});

test('the long comic stacks every panel, with placeholders for missing images', () => {
  const { svg, width, height } = comicStripSVG([
    { title: 'a', scene: '宿舍', line: '还有三千字', image: { dataUrl: 'data:image/png;base64,AAAA', width: 1216, height: 832 } },
    { title: 'b', scene: '还没出图的画面', line: '', image: null },
  ], { title: '论文之夜' });
  assert.equal(width, 1080); assert.ok(height > 1400);
  assert.equal((svg.match(/<image /g) || []).length, 1);
  assert.match(svg, /还没出图的画面/); assert.match(svg, /「还有三千字」/); assert.match(svg, /论文之夜/);
  assert.equal(panelImage({ attachments: [{ dataUrl: 'data:image/png;base64,1' }, { dataUrl: 'data:image/png;base64,2', comfy: {} }] }).dataUrl, 'data:image/png;base64,2');
});

function fakeComfy(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) return new Response('{}', { status: 404 });
    const value = routes[key];
    if (value instanceof Response) return value.clone();
    return new Response(JSON.stringify(typeof value === 'function' ? value(path, init) : value), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { impl, calls };
}

test('proxy: clear error when ComfyUI is not running, and status lists checkpoints', async () => {
  await assert.rejects(comfyStatus({ endpoint: 'http://127.0.0.1:8188' }, async () => { throw new TypeError('fetch failed'); }), /无法连接 ComfyUI（http:\/\/127\.0\.0\.1:8188）/);
  assert.throws(() => comfyBase('file:///etc/passwd'), /http/);
  const { impl } = fakeComfy({ '/system_stats': { system: { comfyui_version: '0.3.40' }, devices: [{ name: 'cuda:0 RTX' }] }, '/object_info/CheckpointLoaderSimple': { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['a.safetensors', 'b.safetensors']] } } } } });
  const status = await comfyStatus({ endpoint: 'http://127.0.0.1:8188/' }, impl);
  assert.deepEqual(status.checkpoints, ['a.safetensors', 'b.safetensors']);
  assert.equal(status.version, '0.3.40');
});

test('proxy: submit, poll queue then history, and fetch the image as a data URL', async () => {
  let finished = false;
  const { impl, calls } = fakeComfy({
    '/prompt': { prompt_id: 'abc-1', number: 3 },
    '/history/abc-1': () => (finished ? { 'abc-1': { status: { status_str: 'success', completed: true }, outputs: { 9: { images: [{ filename: 'W_0001.png', subfolder: '', type: 'output' }] } } } } : {}),
    '/queue': { queue_running: [], queue_pending: [[0, 'other'], [1, 'abc-1']] },
    '/view': new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } }),
  });
  const endpoint = 'http://127.0.0.1:8188';
  const { promptId } = await comfySubmit({ endpoint, workflow: { 1: {} } }, impl);
  assert.equal(promptId, 'abc-1');
  assert.deepEqual(JSON.parse(calls[0].init.body).prompt, { 1: {} });
  assert.deepEqual(await comfyProgress({ endpoint, promptId }, impl), { done: false, running: false, position: 2 });
  finished = true;
  const done = await comfyProgress({ endpoint, promptId }, impl);
  assert.equal(done.images[0].filename, 'W_0001.png');
  const image = await comfyImage({ endpoint, ...done.images[0] }, impl);
  assert.equal(image.dataUrl, 'data:image/png;base64,iVBORw==');
  await assert.rejects(comfyImage({ endpoint, filename: '../x.png' }, impl), /无效/);
  await assert.rejects(comfyProgress({ endpoint, promptId: '../../x' }, impl), /无效/);
});

test('proxy: ComfyUI validation errors are surfaced with the failing node', async () => {
  const bad = new Response(JSON.stringify({ error: { message: 'Prompt outputs failed validation' }, node_errors: { 4: { class_type: 'CheckpointLoaderSimple', errors: [{ message: 'Value not in list', details: "ckpt_name: 'x.safetensors' not in []" }] } } }), { status: 400 });
  const { impl } = fakeComfy({ '/prompt': bad });
  await assert.rejects(comfySubmit({ endpoint: 'http://127.0.0.1:8188', workflow: {} }, impl), /CheckpointLoaderSimple: ckpt_name/);
});
