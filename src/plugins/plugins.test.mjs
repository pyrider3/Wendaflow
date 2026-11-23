import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPluginGate } from './server-gate.mjs';
import { readPluginState, enabledPluginIds, PLUGIN_STORAGE_KEY } from './registry.js';

const memory = (value) => ({ getItem: (key) => (key === PLUGIN_STORAGE_KEY ? value : null) });

test('plugins are off unless explicitly turned on, and bad storage falls back to off', () => {
  assert.deepEqual(readPluginState(memory(null)), { comic: false });
  assert.deepEqual(readPluginState(memory('{"comic":"yes"}')), { comic: false });
  assert.deepEqual(readPluginState(memory('{not json')), { comic: false });
  assert.deepEqual(readPluginState(memory('{"comic":true,"unknown":true}')), { comic: true });
  assert.deepEqual(enabledPluginIds({ comic: true }), ['comic']);
  assert.deepEqual(enabledPluginIds({ comic: false }), []);
});

test('server gate refuses a plugin route until the browser enables it, then forwards to it', async () => {
  const gate = createPluginGate({ comic: { '/comfy/status': async (body) => ({ ok: true, echo: body.endpoint }) } });
  assert.equal(gate.route('GET', '/health'), null);
  assert.equal(gate.route('GET', '/comfy/status'), null);
  const blocked = gate.route('POST', '/comfy/status');
  assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'plugin_disabled'); assert.equal(blocked.apply, undefined);
  assert.deepEqual(gate.route('POST', '/plugins').apply({ enabled: ['comic', 'nope'] }), { enabled: ['comic'] });
  assert.equal(gate.isEnabled('comic'), true);
  assert.deepEqual(await gate.route('POST', '/comfy/status').apply({ endpoint: 'x' }), { ok: true, echo: 'x' });
  gate.route('POST', '/plugins').apply({ enabled: [] });
  assert.equal(gate.route('POST', '/comfy/status').status, 403);
});

test('the main app reaches the comic studio only through the plugin hook', () => {
  const main = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /comfyCall|\/comfy\/|comic\.mjs|storyboardWithAI|COMIC_TEMPLATES|comicSettings/);
  assert.match(main, /useComicPlugin\(/);
  const card = fs.readFileSync(new URL('../cards/CardContent.jsx', import.meta.url), 'utf8');
  assert.match(card, /view\.comicTools && node\.comic/);
  const server = fs.readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /comfyRoutes\[/);
  assert.match(server, /createPluginGate\(\{ comic: comfyRoutes \}\)/);
});
